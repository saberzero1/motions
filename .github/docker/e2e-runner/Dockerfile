FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -q \
    && apt-get install -yq --no-install-recommends \
        # Virtual display + window manager
        xvfb \
        herbstluftwm \
        dzen2 \
        x11-xserver-utils \
        # Electron / Chromium runtime dependencies
        libnss3 \
        libatk-bridge2.0-0t64 \
        libgtk-3-0t64 \
        libgbm1 \
        libasound2t64 \
        libxkbcommon0 \
        libxshmfence1 \
        libdrm2 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libpango-1.0-0 \
        libcairo2 \
        libcups2t64 \
        libatspi2.0-0t64 \
        # NodeSource prerequisites
        ca-certificates \
        curl \
        gnupg \
        # Utilities
        jq \
        git \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -yq --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
CMD ["bash"]
