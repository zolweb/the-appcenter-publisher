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
 * @return {String} API URL
 */
const postAppCenterTriggerBuild = (appName, userName, gitBranch) => APPCENTER_API_CLIENT.post(`/api/v0.1/apps/${userName}/${appName}/branches/${gitBranch}/builds`);

/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {Number} buildId
  * @return {String} API URL
  */
const getAppCenterBuildInfo = (appName, userName, buildId) => APPCENTER_API_CLIENT.get(`/api/v0.1/apps/${userName}/${appName}/builds/${buildId}`);

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
};
