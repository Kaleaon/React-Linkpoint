plugins {
    alias(libs.plugins.kotlin.jvm)
    application
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(testFixtures(project(":core")))
    implementation(project(":core"))
}

application { mainClass.set("MockGridMainKt") }

tasks.register<JavaExec>("runOar") {
    group = "application"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("OarBuilderMainKt")
}
