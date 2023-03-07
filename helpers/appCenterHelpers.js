/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const fs = require('fs');
const readline = require('readline');
const ora = require('ora');
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
// eslint-disable-next-line import/no-dynamic-require
const PACKAGEJSON_FILE = require(`${appRootPath}/package.json`);
const {
  postAppCenterTriggerBuild,
  generateAppCenterBuildURL,
  getAppCenterBuildInfo,
  postAppCenterNewDistributionGroup,
  postAppCenterBranchConfig,
  postAppCenterFileAsset,
  getAppCenterDistributionGroups,
  getAppCenterAppToolsets, getAppCenterBranchConfig, putAppCenterBranchConfig,
} = require('../services/appCenterService');
const { getConfigObject, printConsoleMessage } = require('./commonHelpers');

const CONFIG = getConfigObject();

const APP_CENTER_BUILD_STATUS = {
  NOTSTARTED: 'notStarted',
  PROGRESS: 'inProgress',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
};

const APP_CENTER_BRANCH_CONFIG_TRIGGER = {
  MANUAL: 'manual',
  AUTO: 'continuous',
};

const APP_CENTER_ENV_GROUP_NAMES = {
  staging: 'Staging',
  'pre-prod': 'Preprod',
};

const APP_CENTER_DESTINATION_TYPE_ENV = {
  staging: 'groups',
  'pre-prod': 'groups',
  prod: 'store',
};

const APP_CENTER_TOOLSETS_PLATFORM = {
  ios: 'iOS',
  android: 'Android',
};

/**
 * Get Distribution Group ID from the list depending on the environment
 * @param  {String} branchEnvironment
 * @param  {Array<AppCenterDistributionGroup>} distributionGroupsList
 * @return {String} App Center Distribution Group ID
 */
const getDistributionGroupIdFromEnv = (branchEnvironment, distributionGroupsList = []) => (
  distributionGroupsList.find(
    (group) => group.name === APP_CENTER_ENV_GROUP_NAMES[branchEnvironment],
  )?.id || '');

/**
 * Make an API call on AppCenter to trigger the builds via curl command
 * @param  {Array.<String>} platformList
 * @param  {String} branch
 */
const triggerAppCenterBuild = async (platformList, branch) => {
  const buildStatusQueries = [];

  for (const platform of platformList) {
    const triggerBuildLoader = ora().start(`\x1b[1mRequesting new ${platform} build on AppCenter\x1b[0m\n`);
    const triggerBuildQueryRes = await postAppCenterTriggerBuild(
      CONFIG.appCenter.appName[platform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches[branch],
    );
    if (triggerBuildQueryRes.status === 200 && triggerBuildQueryRes.data) {
      const buildURL = generateAppCenterBuildURL(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        CONFIG.git.branches[branch],
        triggerBuildQueryRes.data.id,
      );
      triggerBuildLoader.succeed(`\x1b[1mThe ${platform} branch is buildind : ${buildURL}\x1b[0m`);
      buildStatusQueries.push(() => getAppCenterBuildInfo(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        triggerBuildQueryRes.data.id,
      ));
    } else {
      triggerBuildLoader.fail(`The ${platform} build was not triggered.\n`);
      // eslint-disable-next-line no-console
      console.error('ERR ', triggerBuildQueryRes.status);
    }
  }

  const buildStatusLoader = ora().start(`\x1b[1mAppCenter is building your app...\x1b[0m\n
  ▸ Updating build status in a minute...\n
  You can terminate this process, this will not affect the build process.
  `);
  const queriesInterval = setInterval(async () => {
    const platformBuildStatusString = {
      ios: '',
      android: '',
    };
    const buildStatusRes = await Promise.all(buildStatusQueries.map((query) => query()));
    const areAllBuildCompleted = buildStatusRes
      .every((buildRes) => buildRes.data.status === APP_CENTER_BUILD_STATUS.COMPLETED);
    const areQueriesFailed = buildStatusRes.every((buildRes) => buildRes.status !== 200);

    if (areQueriesFailed) {
      buildStatusLoader.fail('Failed to get build statuses, check progression with AppCenter links above.');
      return clearInterval(queriesInterval);
    }

    if (areAllBuildCompleted) {
      buildStatusLoader.succeed('\x1b[1mAppCenter builds are completed.\x1b[0m');
      return clearInterval(queriesInterval);
    }

    buildStatusRes.forEach((buildRes) => {
      const isiOSBuild = buildRes?.config?.url?.includes(CONFIG.appCenter.appName.ios);
      const isAndroidBuild = buildRes?.config?.url?.includes(CONFIG.appCenter.appName.android);

      if (isiOSBuild) platformBuildStatusString.ios = `▸ Build iOS : ${buildRes?.data?.status}`;
      if (isAndroidBuild) platformBuildStatusString.android = `▸ Build Android : ${buildRes?.data?.status}`;
    });
    buildStatusLoader.text = `\x1b[1mAppCenter is building your app...\x1b[0m\n
      ${platformBuildStatusString.ios || ''}
      ${platformBuildStatusString.android || ''}
      \nYou can terminate this process, this will not affect the build process.
      `;

    return null;
  }, 30000);
};

/**
 * Prompt the user to specify Keystore informations
 * @return  {Promise<{keyAlias:String, keyPassword:String, keystorePassword:String}>}
 */
const askForAndroidKeyStoreSecrets = async () => {
  const keystorePromptQuestions = [
    {
      type: 'password',
      name: 'keyAlias',
      message: 'You defined a path for your Android Keystore, please provide the key alias : ',
    },
    {
      type: 'password',
      name: 'keyPassword',
      message: 'The key password : ',
    },
    {
      type: 'password',
      name: 'keystorePassword',
      message: 'And the keystore password : ',
    },
  ];
  const results = await prompt(keystorePromptQuestions);

  return results;
};

/**
 * Promp user for the Apple certificate password
 * @return  {Promise<{certificatePassword:String}>}
 */
const askForAppleCertificatePassword = async () => {
  const certificatePromptQuestions = [
    {
      type: 'password',
      name: 'certificatePassword',
      message: 'You defined a path for your Apple Certificate, please provide the password : ',
    },
  ];

  const results = await prompt(certificatePromptQuestions);
  return results;
};

/**
 * Manage Apple certificate password and return config object
 * @return  {Promise<{keyAlias:String, keyPassword:String, keystorePassword:String}>}
 */
const manageAppleCertificateAndProfiles = async (branchEnvironment) => {
  // Upload certificate to AppCenter
  const uploadCertificateLoader = ora().start(`\x1b[1mUploading Apple Certificate and Provisioning Profile for ${branchEnvironment}\x1b[0m\n`);
  try {
    const certificateAssetRes = await postAppCenterFileAsset(
      CONFIG.appCenter.appName.ios,
      CONFIG.appCenter.userName,
      CONFIG.appCenter.appleCertificatePath,
      'certif',
    );

    const profileAssetRes = await postAppCenterFileAsset(
      CONFIG.appCenter.appName.ios,
      CONFIG.appCenter.userName,
      CONFIG.appCenter.appleProvisioningProfilePath[branchEnvironment],
      'provision',
    );

    uploadCertificateLoader.succeed(`\x1b[1mSuccessfuly uploaded Apple Certificate and Provisioning Profile for ${branchEnvironment}\x1b[0m`);
    return {
      certificateFilename: CONFIG.appCenter.appleCertificatePath.split('/').pop(),
      certificateUploadId: certificateAssetRes.id,
      provisioningProfileFilename: CONFIG.appCenter.appleProvisioningProfilePath[branchEnvironment].split('/').pop(),
      provisioningProfileUploadId: profileAssetRes.id,
    };
  } catch (error) {
    uploadCertificateLoader.fail('Could not create upload Apple Certificate and Provisioning Profile\n');
    // eslint-disable-next-line no-console
    console.error('ERR ', error.response.status, error.response.data);
    return {};
  }
};

/**
 * Get environment variables from env.js file and create or edit appcenter-post-clone.sh file
 * @return  {Array<String>} Array of extracted env variable names
 */
const manageEnvironmentVariables = async () => {
  let projectVariables = [];

  try {
    printConsoleMessage('Copy Environment variables from env.js file');

    const postCloneContent = `#!/usr/bin/env bash

echo "==============================================="
echo "SETTING env.js FILE"
echo "==============================================="
cat > ./env.js <<EOL
[variables]
EOL
cat ./env.js
    `;
    const envFileStream = fs.createReadStream(`${appRootPath}/env.js`);
    let variablesToInsert = [];

    const readLineInterface = readline.createInterface({
      input: envFileStream,
      crlfDelay: Infinity,
    });

    for await (const line of readLineInterface) {
      const extractedVariable = line.match(/const([^`]*)=/)?.[1]?.trim();
      if (extractedVariable) {
        projectVariables = projectVariables.concat(extractedVariable);
        variablesToInsert = variablesToInsert.concat(`export const ${extractedVariable} = "\${${extractedVariable}}";\n`);
      }
    }

    const fileContent = postCloneContent.replace(/\[variables\]/, variablesToInsert.join(''));
    fs.writeFileSync('appcenter-post-clone.sh', fileContent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    printConsoleMessage('No Environment variables detected');
  }
  return projectVariables;
};

const getDistributionToolsetsConfig = async (branchEnvironment, platformDistributionGroups) => ({
  distribution: {
    destinations: [
      getDistributionGroupIdFromEnv(branchEnvironment, platformDistributionGroups),
    ], // Group IDs
    destinationType: APP_CENTER_DESTINATION_TYPE_ENV[branchEnvironment],
    isSilent: false,
  },
});

/**
 * Get the base toolsets config object from App Center depending on the OS
 * @param  {String} branchEnvironment
 * @param  {String} applicationPlatform
 * @return {Object} App Center Toolset config object
 */
const getProjectToolsetsConfig = async (branchEnvironment, applicationPlatform) => {
  const toolsetsLoaderString = `project information for branch ${CONFIG.git.branches[branchEnvironment]} for ${CONFIG.appCenter.appName[applicationPlatform]}`;
  // Init Ora loader
  const branchToolsetsLoader = ora().start(`\x1b[1mGetting ${toolsetsLoaderString}\x1b[0m\n`);
  try {
    // Send API Call
    const branchToolsetsQueryRes = await getAppCenterAppToolsets(
      CONFIG.appCenter.appName[applicationPlatform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches[branchEnvironment],
      APP_CENTER_TOOLSETS_PLATFORM[applicationPlatform],
    );

    if ([200, 201].includes(branchToolsetsQueryRes.status)) {
      branchToolsetsLoader.succeed(`\x1b[1m${toolsetsLoaderString} successfully loaded !\x1b[0m`);
      return branchToolsetsQueryRes.data;
    }
  } catch (error) {
    branchToolsetsLoader.fail(`Could not retrieve ${toolsetsLoaderString}\n`);
    // eslint-disable-next-line no-console
    console.error('ERR ', error.response.status, error.response.data);
  }

  return undefined;
};

/**
 * Get the Android toolsets config object with every requirements from App Center
 * @param  {{keystoreEncoded:Base64,
 * keystoreFilename:String,
 * keyAlias:String,
 * keyPassword:String,
 * keystorePassword:String}} keystoreSecretInformation
 * @return {Object} App Center Android Toolset config object
 */
const getAndroidToolsetsConfig = async (keystoreSecretInformation) => ({
  android: {
    buildBundle: CONFIG.appCenter.buildAndroidAppBundle,
    buildVariant: 'release',
    gradleWrapperPath: 'android/gradlew',
    module: 'app',
    runLint: false,
    runTests: false,
    automaticSigning: true,
    ...keystoreSecretInformation,
  },
});

/**
 * Get the Android toolsets config object with every requirements from App Center
 * @param  {String} branchEnvironment
 * @param  {{certificatePassword:String}} appleSecretInformation
 * @param  {object} projectConfigFromAppCenter
 * @return {object} App Center XCode Toolset config object
 */
const getXcodeToolsetsConfig = async (
  branchEnvironment,
  appleSecretInformation,
  projectConfigFromAppCenter,
) => {
  const appleSecretsConfig = await manageAppleCertificateAndProfiles(branchEnvironment);

  return {
    xcode: {
      archiveConfiguration: 'Release',
      podfilePath: projectConfigFromAppCenter.xcode.xcodeSchemeContainers[0].podfilePath,
      projectOrWorkspacePath:
        projectConfigFromAppCenter.xcode.xcodeSchemeContainers[0].workspaceProjectPaths,
      scheme:
        projectConfigFromAppCenter.xcode.xcodeSchemeContainers[0].sharedSchemes[0].name,
      targetToArchive:
        projectConfigFromAppCenter.xcode.xcodeSchemeContainers[0].sharedSchemes[0].archiveProject.archiveTargetId,
      xcodeProjectSha:
        projectConfigFromAppCenter.xcode.xcodeSchemeContainers[0].xcodeProjectSha,
      xcodeVersion: '13.4.1',
      automaticSigning: true,
      forceLegacyBuildSystem: false,
      ...appleSecretInformation,
      ...appleSecretsConfig,
    },
  };
};

/**
 * Update appCenter config for a specific env
 * @param {string} env 'staging' or 'pre-prod' or 'prod'
 * @param {string} platform 'ios' or 'android'
 * @param {object} newConfig
 * @returns {Promise<void>}
 */
const handleUpdateConfig = async (env, platform, newConfig) => {
  const branchConfigLoader = ora().start(`\x1b[1mUpdate appCenter ${env} config on ${platform}\x1b[0m\n`);
  try {
    // Send API Call
    const configQueryRes = await putAppCenterBranchConfig(
      CONFIG.appCenter.appName?.[platform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches?.[env],
      {
        trigger: newConfig?.trigger,
        testsEnabled: newConfig?.testsEnabled,
        badgeIsEnabled: newConfig?.badgeIsEnabled,
        toolsets: newConfig?.toolsets,
        environmentVariables: newConfig?.environmentVariables,
      },
    );
    if ([200, 201].includes(configQueryRes.status)) {
      branchConfigLoader.succeed(`\x1b[1m App center ${platform} ${env} config updated with success !\x1b[0m`);
    }
  } catch (error) {
    if (error.response.status === 404) {
      branchConfigLoader.succeed(`Config of ${platform} for ${env} doesn't exist, please create branch configuration, skipping\n`);
    } else {
      branchConfigLoader.fail(`Could not update config on ${platform} ${env}\n`);
      // eslint-disable-next-line no-console
      console.error('ERR ', error?.response?.status, error?.response?.data);
    }
  }
};

/**
 * Send the previously built App Center Config object to the API
 * @param  {String} branchEnvironment
 * @param  {string} applicationPlatform
 * @param  {object} toolsets
 * @param  {array<string>} environmentVariables
 * @return
 */
const sendAppcenterBranchConfig = async (
  branchEnvironment,
  applicationPlatform,
  toolsets,
  environmentVariables,
) => {
  const envLoaderString = `configuration for branch ${CONFIG.git.branches[branchEnvironment]} for ${CONFIG.appCenter.appName[applicationPlatform]}`;
  const appCenterConfigToSend = {
    badgeIsEnabled: false, // Enable the build status badge
    trigger: APP_CENTER_BRANCH_CONFIG_TRIGGER.MANUAL, // build triggered auto or manual
    environmentVariables: environmentVariables.map((envVariable) => ({
      name: envVariable,
      value: '',
    })),
    toolsets,
  };
  // Init Ora loader
  const branchConfigLoader = ora().start(`\x1b[1mSending ${envLoaderString}\x1b[0m\n`);
  // Trigger API Call
  try {
    // Send API Call
    const branchConfigQueryRes = await postAppCenterBranchConfig(
      CONFIG.appCenter.appName[applicationPlatform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches[branchEnvironment],
      appCenterConfigToSend,
    );

    if ([200, 201].includes(branchConfigQueryRes.status)) {
      branchConfigLoader.succeed(`\x1b[1m${envLoaderString} created with success !\x1b[0m`);
    }
  } catch (error) {
    if (error.response.status === 409) {
      branchConfigLoader.warn(`A ${envLoaderString} already exists, update instead.\n`);
      await handleUpdateConfig(branchEnvironment, applicationPlatform, appCenterConfigToSend);
    } else {
      branchConfigLoader.fail(`Could not create ${envLoaderString}\n`);
      // eslint-disable-next-line no-console
      console.error('ERR ', error.response.status, error.response.data);
    }
  }
};

// EXPORTED METHODS
/**
 * Get appCenter config for a specific env
 * @param {string} env 'staging' or 'pre-prod' or 'prod'
 * @param {string} platform 'ios or 'android
 * @returns {Promise<void>}
 */
const retrieveEnvConfig = async (env, platform) => {
  const branchConfigLoader = ora().start(`\x1b[1mGet ${platform} ${env} AppCenter config\x1b[0m\n`);
  try {
    const getBranchConfig = await getAppCenterBranchConfig(
      CONFIG.appCenter.appName?.[platform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches?.[env],
    );

    if ([200, 201].includes(getBranchConfig.status)) {
      branchConfigLoader.succeed(`\x1b[1m Get ${platform} ${env} AppCenter config with success !\x1b[0m`);
      return getBranchConfig?.data;
    }
  } catch (error) {
    branchConfigLoader.fail('Could not get config\n');
    // eslint-disable-next-line no-console
    console.error('ERR ', error?.response?.status, error?.response?.data);
  }
  return null;
};

/**
 * Create distribution groups in app center config
 * @returns {Promise<void>}
 */
const createAppCenterDistributionGroups = async () => {
  const DISTRIBUTION_GROUPS_NAMES = [
    APP_CENTER_ENV_GROUP_NAMES.staging,
    APP_CENTER_ENV_GROUP_NAMES['pre-prod'],
  ];

  for (const applicationPlatform of Object.keys(CONFIG.appCenter.appName)) {
    for (const groupName of DISTRIBUTION_GROUPS_NAMES) {
      // Create console string to avoid too much repetition
      const distributionGroupConsoleString = `AppCenter ${groupName} distribution group for ${CONFIG.appCenter.appName[applicationPlatform]}`;
      // Init Ora loader
      const distributionGroupLoader = ora().start(`\x1b[1mCreating ${distributionGroupConsoleString}\x1b[0m\n`);
      // Trigger API Call
      try {
        const distributionGroupQueryRes = await postAppCenterNewDistributionGroup(
          CONFIG.appCenter.appName[applicationPlatform],
          CONFIG.appCenter.userName,
          {
            is_public: true,
            name: groupName,
          },
        );

        if ([200, 201].includes(distributionGroupQueryRes.status)) {
          distributionGroupLoader.succeed(`\x1b[1m${distributionGroupConsoleString} created with success !\x1b[0m`);
        }
      } catch (error) {
        if (error.response.status === 409) {
          distributionGroupLoader.succeed(`\x1b[1m${distributionGroupConsoleString} already exists, skipping\x1b[0m`);
        } else {
          distributionGroupLoader.fail(`Could not create ${distributionGroupConsoleString}\n`);
          // eslint-disable-next-line no-console
          console.error('ERR ', error.response.status);
        }
      }
    }
  }
};

/**
 * Create or update config in AppCenter
 * @returns {Promise<void>}
 */
const createAppCenterBranchConfig = async () => {
  let keystoreSecretInformation = {};
  let appleSecretInformation = {};

  if (CONFIG?.appCenter?.keystorePath) {
    keystoreSecretInformation = await askForAndroidKeyStoreSecrets();
    const keystoreFile = fs.readFileSync(CONFIG?.appCenter?.keystorePath);
    const keystoreEncoded = keystoreFile.toString('base64');
    const keystoreFilename = CONFIG?.appCenter?.keystorePath.split('/').pop();
    keystoreSecretInformation = { ...keystoreSecretInformation, keystoreEncoded, keystoreFilename };
  }

  if (CONFIG?.appCenter?.appleCertificatePath) {
    appleSecretInformation = await askForAppleCertificatePassword();
  }

  const environmentVariables = await manageEnvironmentVariables();

  // Iterate through the config platform application Name object keys to get
  // the platform defined by the publishrc file (ios | android)
  for (const applicationPlatform of Object.keys(CONFIG.appCenter.appName)) {
    // Get App Center application distribution groups depending on the application name
    const platformDistributionGroupsRes = await getAppCenterDistributionGroups(
      CONFIG.appCenter.appName[applicationPlatform],
      CONFIG.appCenter.userName,
    );
    // For a given platform, iterate through all branches configuration (staging | pre-prod | prod)
    for (const branchEnvironment of Object.keys(CONFIG.git.branches)) {
      let toolsets = {
        javascript: {
          nodeVersion: '16.x',
          packageJsonPath: 'package.json',
          reactNativeVersion: PACKAGEJSON_FILE.dependencies['react-native'],
          runTests: false,
        },
        ...await getDistributionToolsetsConfig(
          branchEnvironment,
          platformDistributionGroupsRes?.data,
        ),
      };
      const projectConfigFromAppCenter = await getProjectToolsetsConfig(
        branchEnvironment,
        applicationPlatform,
      );

      // Format toolsets for Android platform
      if (applicationPlatform === 'android') {
        toolsets = {
          ...toolsets,
          ...await getAndroidToolsetsConfig(keystoreSecretInformation),
        };
      }
      // Format toolsets for iOS platform
      if (applicationPlatform === 'ios') {
        toolsets = {
          ...toolsets,
          ...await getXcodeToolsetsConfig(
            branchEnvironment,
            appleSecretInformation,
            projectConfigFromAppCenter,
          ),
        };
      }
      await sendAppcenterBranchConfig(
        branchEnvironment,
        applicationPlatform,
        toolsets,
        environmentVariables,
      );
    }
  }
};

module.exports = {
  triggerAppCenterBuild,
  createAppCenterDistributionGroups,
  createAppCenterBranchConfig,
  manageEnvironmentVariables,
  retrieveEnvConfig,
  handleUpdateConfig,
};
