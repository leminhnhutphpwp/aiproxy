const config = require('../config');
const { ModelDiscovery } = require('./model-discovery');

const discovery = new ModelDiscovery(config);

async function initialize() {
  await discovery.initialize();
}

function getPublicModels() {
  return discovery.listFamilies();
}

function resolveModel(alias) {
  return discovery.resolveFamily(alias);
}

function getModelCandidates(alias) {
  return discovery.getCandidates(alias);
}

function getStatus() {
  return discovery.getStatus();
}

function resolveAliasFromCandidate(providerID, modelID) {
  return discovery.resolveAliasFromCandidate(providerID, modelID);
}

function shutdown() {
  discovery.shutdown();
}

function isProviderConnected(providerID) {
  return discovery.isProviderConnected(providerID);
}

function getConnectedProviders() {
  return discovery.getConnectedProviders();
}

function getProviderInfo(providerID) {
  return discovery.getProviderInfo(providerID);
}

function getPublishedCatalog() {
  return discovery.getPublishedCatalog();
}

module.exports = {
  initialize,
  getPublicModels,
  resolveModel,
  getModelCandidates,
  getStatus,
  shutdown,
  isProviderConnected,
  getConnectedProviders,
  getProviderInfo,
  getPublishedCatalog,
};
