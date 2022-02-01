const { getThreads } = require('./client');

const testThreads = async () => {


    console.log(JSON.stringify(getThreads(4), null, 2));
};


testThreads();
