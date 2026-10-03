# syntax=docker/dockerfile:1
FROM node:22.21.1-bookworm AS base

ENV CI=1 \
    EXPO_NO_TELEMETRY=1 \
    EXPO_NO_DOTENV=1 \
    TZ=Europe/Samara
WORKDIR /workspace
COPY package.json package-lock.json .nvmrc ./
RUN test "$(node --version)" = "v$(cat .nvmrc)" \
    && npm ci --no-audit --no-fund \
    && sha256sum package.json package-lock.json > node_modules/.lad-packages
COPY docker/entrypoint.sh /usr/local/bin/lad-entrypoint
ENTRYPOINT ["sh", "/usr/local/bin/lad-entrypoint"]

FROM base AS web
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
CMD ["npm", "run", "web", "--", "--host", "lan", "--port", "8081"]

# Android SDK/NDK for Linux use x86_64 binaries. Compose selects linux/amd64.
FROM base AS android
ARG TARGETARCH
ARG MAESTRO_VERSION=2.11.0
ARG MAESTRO_SHA256=5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a
ARG ANDROID_TOOLS_VERSION=13114758
ARG ANDROID_TOOLS_SHA1=5fdcc763663eefb86a5b8879697aa6088b041e70
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    ANDROID_HOME=/opt/android-sdk \
    GRADLE_USER_HOME=/root/.gradle
ENV PATH="/opt/maestro/bin:${JAVA_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"
RUN test "$TARGETARCH" = amd64 \
    && apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip \
    && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 3 \
        "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_TOOLS_VERSION}_latest.zip" \
        --output /tmp/android-tools.zip \
    && echo "${ANDROID_TOOLS_SHA1}  /tmp/android-tools.zip" | sha1sum --check \
    && mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && unzip -q /tmp/android-tools.zip -d "${ANDROID_HOME}/cmdline-tools" \
    && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm /tmp/android-tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
        "ndk;27.1.12297006" "cmake;3.22.1"
RUN curl --fail --location --retry 3 \
        "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip" \
        --output /tmp/maestro.zip \
    && echo "${MAESTRO_SHA256}  /tmp/maestro.zip" | sha256sum --check \
    && unzip -q /tmp/maestro.zip -d /opt \
    && chmod +x /opt/maestro/bin/maestro \
    && rm /tmp/maestro.zip
# Some library modules use the Android Gradle Plugin's default Build Tools.
RUN sdkmanager "build-tools;35.0.0"
CMD ["node", "docker/android.mjs", "test"]
