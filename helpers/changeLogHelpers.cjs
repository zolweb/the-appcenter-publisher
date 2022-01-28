/**
 * @param  {String} gitLogOutpout
 * @param  {String} commitSplitMarker
 * @param  {Object} CONFIG
 * @return {{features: Array.<string>, fixes: Array.<string>}}
 */
const sortOutGitLogToArrays = (gitLogOutpout, commitSplitMarker, CONFIG) => {
  const commitsArray = gitLogOutpout
    .split(`${commitSplitMarker}\n`)
    .map((commit) => {
      const [message, sha] = commit.split('\n');

      return { sha, message };
    })
    .filter((commit) => Boolean(commit.sha));

  return commitsArray.reduce(
    (acc, commit) => {
      if (commit.message.startsWith(CONFIG.git.commitPrefixes.feature)) {
        const changeLogLine = `* ${commit.message.replace(
          CONFIG.git.commitPrefixes.feature,
          '',
        )} ([${commit.sha.substring(0, 6)}](${CONFIG.git.repoURL}${
          commit.sha
        }))\n`;
        return { ...acc, features: acc.features.concat([changeLogLine]) };
      }
      if (commit.message.startsWith(CONFIG.git.commitPrefixes.bugFix)) {
        const changeLogLine = `* ${commit.message.replace(
          CONFIG.git.commitPrefixes.bugFix,
          '',
        )} ([${commit.sha.substring(0, 6)}](${CONFIG.git.repoURL}${
          commit.sha
        }))\n`;
        return { ...acc, fixes: acc.fixes.concat([changeLogLine]) };
      }

      return acc;
    },
    { features: [], fixes: [] },
  );
};
/**
 * Format in markdown the change log
 * @param  {Array.<string>} features
 * @param  {Array.<string>} fixes
 * @param  {String} newVersionNumber
 * @return {String}
 */
const formatTheChangeLog = (features, fixes, newVersionNumber) => {
  let newChangelog = `# Version ${newVersionNumber} (${
    new Date().toISOString().split('T')[0]
  })\n\n`;

  if (features.length) {
    newChangelog += '## Features\n';
    features.forEach((feature) => {
      newChangelog += feature;
    });
    newChangelog += '\n';
  }

  if (fixes.length) {
    newChangelog += '## Fixes\n';
    fixes.forEach((chore) => {
      newChangelog += chore;
    });
    newChangelog += '\n';
  }

  return newChangelog;
};

module.exports = {
  sortOutGitLogToArrays,
  formatTheChangeLog,
};
