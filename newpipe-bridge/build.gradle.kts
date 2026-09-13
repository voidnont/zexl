plugins {
    application
}

group = "tools.zexl"
version = "1.0.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

dependencies {
    implementation("com.github.teamnewpipe:NewPipeExtractor:v0.26.5")
}

application {
    mainClass.set("tools.zexl.newpipe.Main")
}
