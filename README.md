# zol-appcenter-publish

This script ease the process of publishing React Native builds with Microsoft AppCenter and managing the versionning of your App. Each build to production env will also create a Git Tag and populate a CHANGELOG.md file at the root of your project based on your commits messages.

## How to install

```
yarn add -D zol-msappcenter-publish
```

Then in your `package.json` add

```
"scripts": {
  ...
  "appcenter:publish": "./node_modules/zol-msappcenter-publish/index.cjs"
},
```

Finally in the root directory of your project create a `.publishrc.js`, this will be your script config file.

## Config file

In order for the script to run you will need the basic configuration :

```
module.exports = {
  appCenter: {
    userName: 'my_username',
    token: 'my_token',
    appName: {
      ios: 'ios_app_name',
      android: 'android_app_name',
    },
  },
  git: {
    repoURL: 'https://gitlab.com/[my_team]/[my_project]/'
  }
}
```

Surely you can extend this config file with

```
module.exports = {
  startingVersionNumber: '1.0.0', // This number will be used as versionning starting point
  appCenter: {
    userName: 'my_username',
    token: 'my_token',
    appName: {
      ios: 'ios_app_name',
      android: 'android_app_name',
    },
  },
  git: {
    repoURL: 'https://gitlab.com/[my_team]/[my_project]/',
    branches: {
      staging: 'develop', // Your git branch name pointing to your staging env
      'pre-prod': 'pre-prod', // Your git branch name pointing to your pre-production env
      prod: 'main', // Your git branch name pointing to your production env
    },
    commitPrefixes: {
      feature: '[+]', // custom your commit prefix to identify new feature in changelog
      bugFix: '[#]', // custom your commit prefix to identify bug fixes in changelog
    }
  }
}
```

## Build flow

We thought a strict but usefull flow to publish our release that will impact how you will be using this publishing script. Your `staging` branch should always be your stable branch. In that regard, when you will build for staging, your app will reflect all the work on it. Then you can build on pre-prod, **it will pull everything you have on your staging branch** and merge it on the `pre-prod` branch. Then you will build for prod, if `pre-prod` is stable enough. Because **building for prod means it will pull from `pre-prod` only** and merge it to `prod`. So **it will be impossible** using this publishing script **to build directly for prod from the staging branch**. Keep that in mind in your review and build flow.
