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
    implementation("com.github.TeamNewPipe:NewPipeExtractor:8584a0d636ce6b8371d2c5c83dbe7f01a3d21d59")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
    implementation("com.squareup.okhttp3:okhttp-brotli:5.5.0")
}

application {
    mainClass.set("tools.zexl.newpipe.Main")
}
