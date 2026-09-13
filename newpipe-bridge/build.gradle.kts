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
    implementation("com.github.TeamNewPipe:NewPipeExtractor:13a655fe53e0c3065f88725fc1fb594c3ede0169")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
    implementation("com.squareup.okhttp3:okhttp-brotli:5.5.0")
}

application {
    mainClass.set("tools.zexl.newpipe.Main")
}
