const { execSync } = require('child_process');
const fs = require('fs');
const appRootPath = require('app-root-path');
const { printConsoleMessage, printErrorConsoleMessage } = require('./commonHelpers.js');

const IS_LINUX = process.platform === 'linux';

const getAppCurrentVersionNumber = () => execSync(`grep "versionName" ${appRootPath}/android/app/build.gradle`)
  .toString()
  .split('"')[1];
/**
 * Write in the info.plist the new version number
 */
const updateiOSVersionNumber = () => {
  const currentVersion = getAppCurrentVersionNumber();
  const projectName = execSync(`grep "target" ${appRootPath}/ios/Podfile -m 1`)
    .toString()
    .split("'")[1];
  const infoPlistPath = `${appRootPath}/ios/${projectName}/Info.plist`

  const infoPlistLines = fs.readFileSync(infoPlistPath).toString().split("\n");
  const cFBundleShortVersionStringLineIndex = infoPlistLines
  .findIndex(line => line.includes('CFBundleShortVersionString'))
  infoPlistLines.splice(cFBundleShortVersionStringLineIndex + 1, 1, `\t<string>${currentVersion}</string>`);
  const newInfoPlist = infoPlistLines.join("\n");

  fs.writeFileSync(infoPlistPath, newInfoPlist, function (err) {
    if (err) return printErrorConsoleMessage('Could not update InfoPlist file to update iOS version number');
  });
  // const command = `sed -i ${
  //   IS_LINUX ? '' : "''"
  // } "${20}s/>.*</>${currentVersion}</" "${appRootPath}/ios/${projectName}/Info.plist"`;

  execSync(command);
};
/**
 * Write in the build.gradle the new version number
 * @param  {string} newVersionNumber
 */
const updateAndroidVersionNumber = (newVersionNumber) => {
  const command = `sed -i ${
    IS_LINUX ? '' : "''"
  } 's/versionName.*/versionName "${newVersionNumber}"/' '${appRootPath}/android/app/build.gradle'`;

  execSync(command);
};
/**
 * Will write on the info.plist and build.gradle the new version number
 * based on features and bug fixes numbers
 * @param  {string} currentVersionNumber
 * @param  {number} totalFixesNumber
 * @param  {number} totalFeaturesNumber
 * @return {string} incremented version number
 */
const autoIncrementVersionNumber = (
  currentVersionNumber,
  totalFixesNumber,
  totalFeaturesNumber,
) => {
  const [majorNumber, releaseNumber] = currentVersionNumber.split('.');
  const newReleaseNumber = parseInt(releaseNumber, 10) + 1;
  const newFeaturesNumber = totalFixesNumber + totalFeaturesNumber;
  const newVersionNumber = []
    .concat(majorNumber, newReleaseNumber, newFeaturesNumber)
    .join('.');
  printConsoleMessage(
    `Update Android build.gradle file with new version ${newVersionNumber}`,
  );
  updateAndroidVersionNumber(newVersionNumber);
  printConsoleMessage(
    `Update iOS Info.plist file with new version ${newVersionNumber}`,
  );
  updateiOSVersionNumber();

  return newVersionNumber;
};

module.exports = {
  autoIncrementVersionNumber,
};
