// Top-level build file for zk-passport-android library
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.3.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

plugins {
    id("com.android.library") version "8.3.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.25" apply false
}

allprojects {
    group = "com.grndd.celestials.webrtc"
    version = "1.0.0-SNAPSHOT"
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
