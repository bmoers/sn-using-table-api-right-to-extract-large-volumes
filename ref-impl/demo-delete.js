const { snapshot } = require('./client');

const testDelete = async () => {

    const maxDateValue = '2022-01-01 00:00:00';
    const tables = ['u_rest_api_acl_test','x_sample_table'];
    

    const result = await snapshot({
        uri: process.env.HOST_NAME,
        table: "sys_rollback_sequence",
        threads: 2,
        query: `operation=delete^target_class_nameIN${tables.join(',')}^context.sys_created_on>${maxDateValue}`,
        limit: 500,
        sysIdField: 'document_id',
        dateField: 'context.sys_created_on',
        sysparm: 'sysparm_exclude_reference_link=true'
    }, async (results) => {
        console.log(`Deleted Records in page: ${results.length}`);
        results.map((row)=>{
            console.log(`\tdeleted ${row.document_id}`)
        })
        
    })
    console.log(`Max dateValue in job ${result.maxDate}`)
    console.log('.'.repeat(40))
    console.log(JSON.stringify(result));
};

testDelete();

