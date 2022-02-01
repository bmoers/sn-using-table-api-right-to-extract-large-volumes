const { increment } = require('./client');

const testIncrement = async () => {

    const maxDateValue = '2022-01-26 20:53:18';

    const result = await increment({
        uri: process.env.HOST_NAME,
        table: process.env.TABLE_NAME,
        threads: 2,
        query: "sys_id=129219e12f914510d8455aab2799b6c3",
        maxDateValue
    }, async (results) => {
        //console.log(`Simulate Persist for Page Rows: ${results.length}`);
    })
    console.log(JSON.stringify(result));
};

testIncrement();
