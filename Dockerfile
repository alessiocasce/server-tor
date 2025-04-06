FROM node:18-slim

# Install Tor
RUN apt-get update && \
    apt-get install -y tor && \
    rm -rf /var/lib/apt/lists/*

# Set up Tor control password
# Replace 'tor_password' with your real password
RUN echo "ControlPort 9051\nHashedControlPassword $(tor --hash-password password1234 | grep '^16:')" > /etc/tor/torrc

# Create app directory
WORKDIR /app
COPY . .
RUN npm install

# Start Tor and your server
CMD tor & sleep 5 && npm start
