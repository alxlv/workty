FROM nodesource/vivid:4.4

#RUN curl https://deb.nodesource.com/node_4.x/pool/main/n/nodejs/nodejs_4.4.0-1nodesource1~vivid1_amd64.deb > node.deb \
# && dpkg -i node.deb \
# && rm node.deb

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    bzr \
    git \
    openssh-client \
    apt-utils \
    psmisc \
    nano \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# gpg keys listed at https://github.com/nodejs/node
RUN set -ex \
  && for key in \
    9554F04D7259F04124DE6B476D5A82AC7E37093B \
    94AE36675C464D64BAFA68DD7434390BDBE9B9C5 \
    0034A06D9D9B0064CE8ADF6BF1747F4AD2306D93 \
    FD3A5288F042B6850C66B31F09FE44734EB7990E \
    71DCFD284A79C3B38668286BC97EC7A07EDE3FC1 \
    DD8F2338BAE7501E3DD5AC78C273792F7D83545D \
    B9AE9905FFD7803F25714661B63B535A4C206CA9 \
    C4F0DFFF4E8C1A8236409D08E73BC641CC11F4C8 \
  ; do \
    gpg --keyserver ha.pool.sks-keyservers.net --recv-keys "$key"; \
  done

ENV NPM_CONFIG_LOGLEVEL info
ENV NODE_VERSION 4.4.0

RUN curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" \
  && curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \
  && grep " node-v$NODE_VERSION-linux-x64.tar.gz\$" SHASUMS256.txt | sha256sum -c - \
  && tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
  && rm "node-v$NODE_VERSION-linux-x64.tar.gz" SHASUMS256.txt SHASUMS256.txt.asc

# Install npm modules in /tmp/node_modules
ADD package.json /tmp/package.json
RUN cd /tmp && npm install

# Create app directory
RUN mkdir -p /opt/workty-restapi-app && cp -a /tmp/node_modules /opt/workty-restapi-app
WORKDIR /opt/workty-restapi-app
ADD . /opt/workty-restapi-app

# Expose 1 port
EXPOSE 9999
CMD node /opt/workty-restapi-app/api/app.js --root_folder=/opt/workty-restapi-app --major_version=1 --dbhostname=127.0.0.1 --dbname=workty

