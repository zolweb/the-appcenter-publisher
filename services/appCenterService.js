const fs = require('fs');
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
  * @return {Promise<Axios>}
  */
const getAppCenterDistributionGroups = (appName, userName) => APPCENTER_API_CLIENT.get(`/api/v0.1/apps/${userName}/${appName}/distribution_groups`);

/**
  * @param  {String} appName
  * @param  {String} userName
  * @param  {String} filePath
  * @param  {String} type - provision|certif
  * @return {Promise<UploadInformation>}
  */
const postAppCenterFileAsset = async (appName, userName, filePath, type) => {
  const fileStats = fs.statSync(filePath);
  const fileName = filePath.split('/').pop();
  const file = fs.readFileSync(filePath);
  const contentType = {
    provision: 'application/x-apple-aspen-mobileprovision',
    certif: 'application/x-pkcs12',
  };
  try {
    // First we need to create an entry for our file in App Center
    const fileAssetRes = await APPCENTER_API_CLIENT.post(`/api/v0.1/apps/${userName}/${appName}/file_asset`);
    // Then we send the metadata thanks to the information from the previous call
    const fileMetadataRes = await axios.post(`${fileAssetRes.data.uploadDomain}/upload/set_metadata/${fileAssetRes.data.id}?file_name=${fileName}&file_size=${fileStats.size}&content_type=${contentType[type]}&token=${fileAssetRes.data.urlEncodedToken}`);
    console.log('METADATA RES :', fileMetadataRes.data);
    // We start sending the chunks of bits with the maximum size given previously
    const resres = await axios.post(
      `${fileAssetRes.data.uploadDomain}/upload/upload_chunk/${fileAssetRes.data.id}?block_number=${fileMetadataRes.data.blob_partitions}&token=${fileAssetRes.data.urlEncodedToken}`,
      file.toString('base64'),
      {
        headers: {
          'Content-Type': 'application/x-binary',
        },
      },
    );
    console.log('RES UPLOAD CONFIG:', resres.config);
    // We tell the upload service that the upload is finished
    const finishres = await axios.post(`${fileAssetRes.data.uploadDomain}/upload/finished/${fileAssetRes.data.id}?token=${fileAssetRes.data.urlEncodedToken}`);
    console.log('FINISH UPLOAD :', finishres.data);
    return {
      id: fileAssetRes.data.id,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('ERR APP CENTER SERVICE / postAppCenterFileAsset', error.response.status, error.response.data);
    return undefined;
  }
};

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
  postAppCenterFileAsset,
  getAppCenterDistributionGroups,
};
