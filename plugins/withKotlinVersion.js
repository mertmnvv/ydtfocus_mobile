const { withProjectBuildGradle } = require('expo/config-plugins');

// react-native-google-mobile-ads pins play-services-ads 25.4.0, which ships
// Kotlin 2.3.0 metadata. Expo 57 / RN 0.81's default Kotlin (2.1.20) can't
// read it ("Module was compiled with an incompatible version of Kotlin").
// expo-build-properties' `android.kotlinVersion` option has no effect here
// (this project's root build.gradle template never reads that gradle
// property), so we patch the buildscript block directly on every prebuild.
const KOTLIN_VERSION = '2.3.20';

module.exports = function withKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(`kotlinVersion = "${KOTLIN_VERSION}"`)) {
      return config;
    }

    config.modResults.contents = config.modResults.contents
      .replace(
        'buildscript {\n  repositories {',
        `buildscript {\n  ext {\n    kotlinVersion = "${KOTLIN_VERSION}"\n  }\n  repositories {`
      )
      .replace(
        "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
        `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:\${kotlinVersion}")`
      );

    return config;
  });
};
