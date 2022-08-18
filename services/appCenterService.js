const axios = require('axios');
const { getConfigObject } = require('../helpers/commonHelpers');

const APP_CENTER_HOST = 'https://appcenter.ms';
const APPCENTER_API_CLIENT = axios.create({
  baseURL: APP_CENTER_HOST,
  headers: {
    'X-API-Token': getConfigObject()?.appCenter?.token,
  },
});

/**
 * @param  {String} appName
 * @param  {String} userName
 * @param  {String} gitBranch
 * @return {Promise<Axios>}
 */
const postAppCenterTriggerBuild = (appName, userName, gitBranch) => APPCENTER_API_CLIENT.post(`/api/v0.1/apps/${userName}/${appName}/branches/${gitBranch}/builds`);

/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {Number} buildId
  * @return {Promise<Axios>}
  */
const getAppCenterBuildInfo = (appName, userName, buildId) => APPCENTER_API_CLIENT.get(`/api/v0.1/apps/${userName}/${appName}/builds/${buildId}`);

/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {{is_public:Boolean, name:String}} groupInfo
  * @return {Promise<Axios>}
  */
const postAppCenterNewDistributionGroup = (appName, userName, groupInfo) => APPCENTER_API_CLIENT.post(`/api/v0.1/apps/${userName}/${appName}/distribution_groups`, groupInfo);

/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {String} gitBranch
  * @param  {Object} appCenterConfig
  * @return {Promise<Axios>}
  */
const postAppCenterBranchConfig = (appName, userName, gitBranch, appCenterConfig) => APPCENTER_API_CLIENT.post(`/api/v0.1/apps/${userName}/${appName}/branches/${gitBranch}/config`, appCenterConfig);
/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {String} gitBranch
  * @param  {Number} buildId
  * @return {String} APP CENTER build URL
  */
const generateAppCenterBuildURL = (appName, userName, gitBranch, buildId) => `https://appcenter.ms/users/${userName}/apps/${appName}/build/branches/${gitBranch}/builds/${buildId}`;

module.exports = {
  postAppCenterTriggerBuild,
  generateAppCenterBuildURL,
  getAppCenterBuildInfo,
  postAppCenterNewDistributionGroup,
  postAppCenterBranchConfig,
};
