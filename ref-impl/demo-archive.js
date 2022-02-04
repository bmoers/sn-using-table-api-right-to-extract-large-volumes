const { snapshot } = require('./client');

const testArchive = async () => {

    const maxDateValue = '2021-12-04 11:00:03';
    const tables = ['u_rest_api_acl_test','sys_email'];
    

    const result = await snapshot({
        uri: process.env.HOST_NAME,
        table: "sys_archive_log",
        threads: 2,
        query: `restored=NULL^from_tableIN${tables.join(',')}^sys_created_on>${maxDateValue}`,
        limit: 500,
        dateField: 'sys_created_on',
        fields: ['id', 'from_table']
    }, async (results) => {
        console.log(`Archived Records in page: ${results.length}`);
        results.map((row)=>{
            console.log(`\tarchived ${row.id.value} ${row.from_table}`)
        })
        
    })
    console.log(`Max dateValue in job ${result.maxDate}`)
    console.log('.'.repeat(40))
    console.log(JSON.stringify(result));
};

testArchive();

