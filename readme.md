<!-- TOC ignore:true -->
# ServiceNow Data Replication done right

<!-- TOC -->

* [Problem description](#problem-description)
  * [Drawbacks](#drawbacks)
* [Solution](#solution)
  * [Timestamp Problem](#timestamp-problem)
  * [Empty Page Problem](#empty-page-problem)
  * [Multi Threading](#multi-threading)
  * [Rolling end](#rolling-end)
* [Implementation in Pseudocode](#implementation-in-pseudocode)
* [Reference Implementation](#reference-implementation)
  * [Thread and jobs sequence](#thread-and-jobs-sequence)

<!-- /TOC -->
## Problem description

Loading data correctly from ServiceNow can be challenging if the records in ServiceNow do frequently change, ACL's apply or data is deleted.  

Daniel Draes wrote a [ServiceNow Community article](https://community.servicenow.com/community?id=community_article&sys_id=80ec3bb7db13c890414eeeb5ca961929) about this topic.  
However the solution he proposed has some drawbacks.  

The solution proposed is to sort the records by sys_updated_on and upsert (insert or update) records in the database as they might occur multiple times in the result list (when updated during the run)

### Drawbacks

**multi threading** - multi threading on timestamp requires to have good knowledge of the data and how its spread over the day  

**empty page** - an empty page is **not** an indicator that there is no more data - there is a good chance that there is just an ACL causing an empty page  

**identical timestamp** - there is a risk that all records in a page do have the same timestamp value, in that case the query to the next page (timestamp > lastrow(timestamp)) will miss some records.  

**rolling end** - if the records are created/updated in high frequency the number of rows exceed the window size and the job never ends

## Solution

### Timestamp Problem

To solve this problem, additionally sort by `sys_id` and query the next page as following:  
`(sys_updated_on  > last_page_max(sys_updated_on)) OR (sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id))`

### Empty Page Problem

As an empty page can be caused by ACL, its not an indicator for the last page has reached. Also if the above query is used, there is a certain risk that there are more rows on the next page which can not be reached.  
To solve this problem, use the NEXT url from the LINK header which contains the same query but a higher `sysparm_offset` until there is data or no next link.

### Multi Threading

To solve this problem, in each thread query for a range of sys_id values. Each thread will query the same pages with a different range like:

1. sys_id<40
2. sys_id>=40^sys_id<80
3. query": "sys_id>=80^sys_id<c0
4. sys_id>=c0

### Rolling end

To solve this problem a threshold must be set after which the load ends. The `x-total-count` header on the first request can be used to calculate the expected number of pages.

## Implementation in Pseudocode

The procedure is basically:

* get *limit* number of records from table
* on the first page:
  * get the *total* number of records in ServiceNow ('x-total-count')
  * calculate the *expected* number of pages ('x-total-count/limit')
* on every page:
  * if there are no rows on the page follow the next link in the 'link' header, if there is no next link, exit
  * if there are rows, get the sys_updated_on and sys_id from the last record and use it in the next query
  * if the *current* rowNum is more than *expected* rowNum (times threshold) exit  

```javascript
// get all records ordered by sys_updated_on, sys_id
// limit to 25 rows per page
url= 'sysparm_query=ORDERBYsys_updated_on^ORDERBYsys_id&sysparm_limit=25'
page = 1
threshold = 1.5
while(url){

    // execute REST call
    response = call(url);

    // do following only on the first page
    if(page == 1){
        // the total rows in servicenow
        totalRowCount = response.header['x-total-count']

        // the number of pages 
        expectedPages = totalRowCount / limit
    }

    if(page > expectedPages * threshold){
        // reached threshold, exit
        url = false;
    }

    // number of records on the page
    pageRowCount = response.result.length;
    
    if(pageRowCount == 0){ // no rows on the page
        // link to the next page
        next = response.header['link'].next.url
        if(next){
            // use the next link to check if there are more
            url = next;
        } else {
            // no next link, this is the end of the table
            url = false;
        }
    } else {
        // the last record on the page
        lastRecord = response.result[response.result.length -1]
        // the max values
        lastPageMaxDate = lastRecord.sys_updated_on
        lastPageMaxSysId = lastRecord.sys_id
        
        url = `sys_updated_on>${lastPageMaxDate}^NQsys_updated_on=${lastPageMaxDate}^sys_id>${lastPageMaxSysId}`
    }

    // increase the page
    page++
}
```

## Reference Implementation

A reference implementation of above process cab be found in the [ref-impl](./ref-impl) directory.  
Before running the demo scripts, rename [.env.sample](./ref-impl/.env.sample) to .env and update the variables according to your environment. Make sure you first run `npm install`.  

* [client.js](./ref-impl/client.js) - REST client implementation

Run following demo script like `node demo-increment.js`

* [demo-increment.js](./ref-impl/demo-increment.js) - increment load demo with 2 parallel threads (using client.js)
* [demo-snapshot.js](./ref-impl/demo-snapshot.js) - snapshot load demo with 2 parallel threads (using client.js)
* [demo-tread.js](./ref-impl/demo-tread.js) - generate thread load information for 4 parallel threads (using client.js)

### Thread and jobs sequence

A visual representation of threads and page loads can be found in following JSON files:  

* [sample-snapshot-2-tread-with-acl.json](./sample/sample-snapshot-2-tread-with-acl.json)
* [sample-increment-2-tread-with-acl.json.jsonn](./sample/sample-increment-2-tread-with-acl.json.json)
