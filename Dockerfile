FROM ubuntu:18.04 as refal_host

RUN apt-get update
RUN apt-get install -y git dos2unix curl unzip sed g++

# install node
ENV NODE_VERSION=16.13.0
RUN apt install -y curl
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
RUN node --version
RUN npm --version

# fetch refal-5-lambda
WORKDIR /usr/src
RUN git clone https://github.com/bmstu-iu9/simple-refal-distrib.git

# install refal-5-lambda
WORKDIR /usr/src/simple-refal-distrib
RUN ./bootstrap.sh

ENV PATH="/usr/src/simple-refal-distrib/bin:${PATH}"
ENV RL_MODULE_PATH="/usr/src/simple-refal-distrib/lib:$RL_MODULE_PATH"

COPY . /app
WORKDIR /app
RUN rlc dummy_terminator.ref
RUN rlc test_check.ref
RUN rlc test_gen.ref
RUN rlc total_results.ref

RUN dos2unix run_test.sh
RUN chmod +x run_test.sh
ENTRYPOINT ["./run_test.sh"]
