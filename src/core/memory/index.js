const store = require('./store');
const extraction = require('./extraction');
const retrieval = require('./retrieval');

const memoryService = {
  ...store,
  ...extraction,
  ...retrieval,
};

module.exports = memoryService;
