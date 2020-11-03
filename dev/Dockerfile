FROM node:14.14.0-buster
COPY package.json /app/package.json
RUN cd /app && npm install

RUN git config --global user.email "test-user@test.com" && \
	git config --global user.name "Test User"

WORKDIR /app