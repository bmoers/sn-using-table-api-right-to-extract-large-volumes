require('dotenv').config()

const axios = require('axios');
const parse = require('parse-link-header');

const baseRequestConfiguration = {
    uri: undefined,
    table: undefined,
    fields: [],
    query: undefined,
    lastPageMaxDate: undefined,
    lastPageMaxSysId: undefined,
    dateField: 'sys_updated_on',
    sysIdField: 'sys_id',
    url: undefined,
    limit: 25,
    continue: true,
    pageThreshold: 1.5
};

/**
 * Call axios REST client with URL
 * @param {*} url REST endpoint URL
 * @returns Axios response
 */
const loadData = async (url) => {
    return axios({
        method: 'get',
        url: url,
        auth: {
            username: process.env.USERNAME,
            password: process.env.PASSWORD
        }
    });
}

/**
 * Compile configuration object
 * 
 * @param {Object} config - Request configuration
 * @param {String} config.uri - ServiceNow host (https://customer.host.com)
 * @param {String} config.table - Table to query from
 * @param {Array} config.fields - Fields to query on table
 * @param {String} config.query - Query condition
 * @param {Number} config.limit - Number of rows per page
 * @param {String} config.dateField - sys_updated_on or sys_created_on
 * @param {Number} config.pageThreshold - Stop loading additional data if number of loaded pages exceeds this factor (handy if table changes quickly while loading data)
 * 
 * @returns {Object} configuration object
 */
const getBaseConfiguration = ({ uri, table, fields, query, limit, dateField, pageThreshold }) => {

    if (!uri) {
        throw Error('URI of ServiceNow Instance not defined');
    }
    if (!table) {
        throw Error('Table to load not defined');
    }

    const config = {
        ...baseRequestConfiguration
    }
    config.uri = uri;
    config.table = table;

    if (fields) {
        if (Array.isArray(fields)) {
            config.fields = fields.map((f) => f.trim());
        } else {
            config.fields = fields.split(',').map((f) => f.trim());
        }
    }

    if (!config.fields.includes(config.sysIdField)) {
        config.fields.push(config.sysIdField);
    }
    if (!config.fields.includes(config.dateField)) {
        config.fields.push(config.dateField);
    }

    config.query = query;
    if (limit != undefined) {
        config.limit = limit;
    }
    if (dateField) {
        config.dateField = dateField;
    }
    if (pageThreshold && typeof pageThreshold == 'number') {
        // threshold can not be less than 1
        config.pageThreshold = Math.max(1, Math.abs(pageThreshold));
    }
    return config;
}

/**
 * Compile request configuration object
 * 
 * @param {Object} config - Request configuration
 * @param {String} config.uri - ServiceNow host (https://customer.host.com)
 * @param {String} config.table - Table to query from
 * @param {Array} config.fields - Fields to query on table
 * @param {String} config.query - Query condition
 * @param {Number} config.limit - Number of rows per page
 * @param {String} config.dateField - sys_updated_on or sys_created_on
 * @param {Number} config.pageThreshold - Stop loading additional data if number of loaded pages exceeds this factor (handy if table changes quickly while loading data)
 * 
 * @param {Object} response - the Axios response from the previous call
 * @param {Number} pageNum - Number of rows found on the last page
 * @param {Number} expectedPageCount - Number of rows expected per page
 * 
 * @returns {Object} request configuration object
 */
const getRequestConfiguration = ({ uri, table, fields, query, limit, dateField, pageThreshold }, response, pageNum, expectedPageCount) => {

    const config = getBaseConfiguration({ uri, table, fields, query, limit, dateField, pageThreshold })

    // the count information is based on raw SQL query ant not following any ACL
    let queryTotalRowCount = parseInt((response.headers['x-total-count'] || 0), 10);
    if (queryTotalRowCount == 0) {
        // no records found with this query
        config.message = 'no records found with this query';
        config.continue = false;
        return config;
    }

    // in case the data is created faster than loaded, break after reaching the threshold
    if (pageNum > (expectedPageCount * pageThreshold)) {
        config.message = `Page Threshold of ${pageThreshold} exceeded with ${pageNum} of expected ${expectedPageCount} pages`;
        config.continue = false;
        return config;
    }

    let result = response.data.result;

    // check the row num on the page
    const pageRowCount = result.length;
    config.message = `pageRowCount is ${pageRowCount}`

    if (pageRowCount == 0) {
        // there are no rows on the page
        const link = response.headers['link'];
        let nextLink;

        if (link) {
            nextLink = parse(link)['next'];
        }
        if (nextLink) {
            // if there are NO rows on the page, use the next link to get to the next page
            // there are no rows on the page (ACL)
            config.message += '\nthere are no rows on the page (ACL)';
            config.url = nextLink.url;
            config.continue = true;
        } else {
            // there is no next link, we're at the end of the query
            config.message += '\nthere is no next link. this is the end of the query';
            config.continue = false;
        }
        return config;
    }

    // get the timestamp & sysId information from the last record in the response
    const lastRow = result[pageRowCount - 1];
    config.lastPageMaxDate = lastRow[config.dateField];
    config.lastPageMaxSysId = lastRow[config.sysIdField];
    config.continue = true;

    return config;
}

/**
 * 
 * @param {Object} config - Request configuration
 * @param {String} config.uri - ServiceNow host (https://customer.host.com)
 * @param {String} config.table - Table to query from
 * @param {Array} config.fields - Fields to query on table
 * @param {String} config.query - Query condition
 * @param {Number} config.limit - Number of rows per page
 * @param {String} config.dateField - sys_updated_on or sys_created_on
 * @param {Number} config.threads - Number of parallel threads to load data
 * @param {Number} config.pageThreshold - Stop loading additional data if number of loaded pages exceeds this factor (handy if table changes quickly while loading data)
 * @param {Promise<Array>} pageCallback - Results of the current page
 * @returns {Array} list of processed threads and pages
 */
const run = async ({ uri, table, fields, query, limit, dateField, threads = 1, pageThreshold }, pageCallback = async (results) => {}) => {

    // get the sys_id queries to split the load
    const threadsArray = getThreads(threads);

    // parallel execution of all threads
    const out = threadsArray.map(async (thread, index) => {

        let totalRowCount = 0;
        let expectedRowCount = Infinity;
        let expectedPageCount = Infinity;
        let pageNum = 0;
        let pageQuery;
        let pageQueryArray = [];

        // add the thread query to split the job into multiple threads
        if (thread.query) {
            pageQueryArray.push(thread.query);
        }
        // in case there is an default query
        if (query) {
            pageQueryArray.push(query);
        }

        // create the query to be used in this thread
        pageQuery = pageQueryArray.length ? pageQueryArray.join('^') : undefined;

        // logs object - for information only!
        const logs = { thread, index, pages: undefined, query: pageQuery, totalRowCount, config: [] };

        // get the base properties
        const baseProperties = getBaseConfiguration({ uri, table, fields, query: pageQuery, limit, dateField, pageThreshold });
        // this is also the starting point for the first request
        let config = { ...baseProperties };

        // loop all the pages until there is no valid configuration anymore
        while (config.continue) {
            pageNum++;

            let url;

            if (config.url) {
                // take the url from the link tag (next param)
                url = config.url;
            } else {

                // order by the date and sys_id field
                const orderBy = `ORDERBY${config.dateField}^ORDERBYsys_id`;

                // construct the url based on the query params
                let query = orderBy;

                // these two parameters are set if there was data on the last page
                if (config.lastPageMaxDate && config.lastPageMaxSysId) {

                    // build the query condition
                    const condition = [`${config.dateField}>${config.lastPageMaxDate}`];
                    const orCondition = [`${config.dateField}=${config.lastPageMaxDate}^${config.sysIdField}>${config.lastPageMaxSysId}`];
                    if (config.query) {
                        condition.push(config.query);
                        orCondition.push(config.query);
                    }
                    // the 'date value' on the next page is higher than the last 'date value' on the previous page
                    // OR
                    // the 'date value' is the same as the last 'date value' on the previous page and the 'sys_id' is higher than the last 'sys_id' on the previous page
                    query = `${condition.join('^')}^NQ${orCondition.join('^')}^${orderBy}`; //encodeURI();

                } else if (config.query) {
                    query = `${config.query}^${orderBy}`;
                }

                url = `${config.uri}/api/now/table/${config.table}?sysparm_fields=${config.fields.join(',')}&sysparm_query=${query}&sysparm_limit=${config.limit}`;
            }

            // call the REST Api with the URL from above
            const response = await loadData(url);

            // get the total count from the first page - it indicates the total number of records in ServiceNow
            if (expectedRowCount == Infinity) {
                // expected number of rows 
                expectedRowCount = parseInt((response.headers['x-total-count'] || 0), 10);
                // expected number of pages
                expectedPageCount = Math.ceil(expectedRowCount / config.limit);
            }

            // get the number of rows on the current page
            let result = response.data.result;
            const pageRowCount = result.length;
            // add to total rows in the thread
            totalRowCount += pageRowCount;

            // ----------- persist the data ----------------
            await pageCallback(result);

            // keep the data for information purpose only !! 
            const log = { ...config, pageRowCount, requestURL: url };
            console.log(`thread: ${index}, totalPages: ${expectedPageCount}, pageNum: ${pageNum}, expectedRowCount: ${expectedRowCount}, totalRowCount: ${totalRowCount}, pageRowCount: ${pageRowCount}`)

            // get the configuration for the next page
            config = getRequestConfiguration(baseProperties, response, pageNum, expectedRowCount);

            // the message 
            logs.config.push({ ...log, message: config.message });

        }

        logs.totalRowCount = totalRowCount;
        logs.pages = pageNum;
        logs.expectedRowCount = expectedRowCount;
        logs.expectedPageCount = expectedPageCount;

        return logs
    });

    // wait for all the threads to complete
    const jobs = await Promise.all(out);

    // calculate total information
    const result = jobs.reduce((out, thread) => {
        out.totalRows += thread.totalRowCount;
        out.totalPages += thread.pages;
        return out;
    }, { totalRows: 0, totalPages: 0 })

    result.jobs = jobs;

    return result;
}

/**
 * Dummy wrapper for demo to log snapshot message
 * 
 * @param {*} config 
 * @param {*} pageCallback 
 */
const snapshot = async (config, pageCallback) => {

    console.log('.'.repeat(40))
    console.log('  Snapshot load');
    console.log(config)
    console.log('.'.repeat(40))
    return run(config, pageCallback);
}

/**
 * Sample implementation to do increment data refresh.
 * As there is a certain risk that after a cloning the max(timestamp) in ServiceNow are higher a aggregation request is made against ServiceNow first.
 * However, this does not solve all the possible cloning issues.
 * 
 * @param {Object} config - Request configuration
 * @param {String} config.uri - ServiceNow host (https://customer.host.com)
 * @param {String} config.table - Table to query from
 * @param {Array} config.fields - Fields to query on table
 * @param {String} config.query - Query condition
 * @param {Number} config.limit - Number of rows per page
 * @param {String} config.dateField - sys_updated_on or sys_created_on
 * @param {Number} config.threads - Number of parallel threads to load data
 * @param {Number} config.pageThreshold - Stop loading additional data if number of loaded pages exceeds this factor (handy if table changes quickly while loading data)
 * @param {Promise<Array>} pageCallback - Results of the current page
 */
const increment = async ({ uri, table, fields, query, limit, dateField, threads, pageThreshold, maxDateValue }, pageCallback = async (results) => {}) => {

    console.log('.'.repeat(40))
    console.log('  Increment load');
    console.log({ uri, table, fields, query, limit, dateField, threads, pageThreshold, maxDateValue })
    console.log('.'.repeat(40))

    if (!maxDateValue) {
        throw Error(`maxDateValue not specified`);
    }

    // aggregation configuration
    const properties = { uri, table, fields, query, limit, dateField };
    const config = getBaseConfiguration(properties);

    // query for max sys_updated|created_on
    let url = `${config.uri}/api/now/stats/${config.table}?sysparm_max_fields=${config.dateField}`;
    if (config.query) {
        url = `${url}&sysparm_query=${config.query}`
    }

    // aggregate the max values 
    const aggregate = await loadData(url);

    // get the max value
    const snMaxDateValue = aggregate.data.result.stats.max[config.dateField];
    if (!snMaxDateValue) {
        console.log(`No new records found for ${config.table}.${config.dateField} - ${config.query}`)
    }

    // compare the timestamps
    const maxDate = new Date(maxDateValue);
    const snMaxDate = new Date(snMaxDateValue)
    if (maxDate.getTime() > snMaxDate.getTime()) {
        // if the timestamp in the DB is higher than the one in ServiceNow
        console.warn('instance potentially cloned. do a full refresh');
        return;
    }

    // build query for increment load
    let incrementQuery = `${config.dateField}>${maxDateValue}`;
    if (config.query) {
        incrementQuery = `${incrementQuery}^${config.query}`
    }

    // run 
    return run({ uri, table, fields, query: incrementQuery, limit, dateField, threads, pageThreshold }, pageCallback);

}

/**
 * Create a list of sys_id queries to split the REST API load over
 * multiple parallel threads
 * 
 * Returns following structure:
 * [
 *  { min: undefined, max: '55', query: 'sys_id<55' },
 *  { min: '55', max: 'aa', query: 'sys_id>=55^sys_id<aa' },
 *  { min: 'aa', max: undefined, query: 'sys_id>=aa' }
 * ]
 * 
 * @param {Number} num the number of parallel threads
 * @returns {Array} list of thread configuration
 */
const getThreads = (num = 1) => {

    const threads = [];
    num = num ? Math.abs(num) : 1
    const min = 0;
    const max = 255;
    const maxThreads = 32;
    const numThreads = Math.min(num, maxThreads);
    const blockSize = Math.ceil(max / numThreads);

    let low = 0;
    let high = 0;

    for (var i = 1; i <= numThreads; i++) {
        high = high + blockSize
        threads.push({ min: low > min ? low.toString(16) : undefined, max: high < max ? high.toString(16) : undefined, query: undefined });
        low = low + blockSize;
    }

    return threads.map((p) => {
        const query = [];
        if (p.min) {
            query.push(`sys_id>=${p.min}`)
        }
        if (p.max) {
            query.push(`sys_id<${p.max}`)
        }
        if (query.length) {
            p.query = query.join('^');
        }
        return p;
    });
}

module.exports = {
    increment,
    snapshot
}
