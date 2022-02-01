const { snapshot } = require('./client');

const testSnapshot = async () => {

    const result = await snapshot({
        uri: process.env.HOST_NAME,
        table: process.env.TABLE_NAME,
        threads: 2,
        //query: "sys_id=1"
    }, async (results) => {
        //console.log(`Simulate Persist for Page Rows: ${results.length}`);
    })

    console.log(JSON.stringify(result));
};


testSnapshot();
