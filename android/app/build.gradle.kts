plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.senac.smartia.ecoengineers"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.senac.smartia.ecoengineers"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Endereço do servidor (site + broker MQTT em /mqtt). Troque para o seu deploy.
        buildConfigField("String", "SERVER_URL", "\"https://ecoengineers.azurewebsites.net\"")
        buildConfigField("String", "MQTT_URL", "\"wss://ecoengineers.azurewebsites.net/mqtt\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    // Cliente MQTT (assina alertas/# no broker do servidor via WebSocket seguro)
    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")
}
