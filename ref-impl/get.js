module.exports = (pathArr, object) => pathArr.reduce((obj, segment) => (obj && obj[segment]) ? obj[segment] : null, object);
