#!/bin/bash

# Alipay API Server Deployment Script (CLI Version)
# Run this on your Aliyun server:
# curl -fsSL https://raw.githubusercontent.com/Lance-yan007/L-reader/main/deploy.sh | bash
# OR copy-paste the commands below:

# 1. Install Node.js 18
echo "Installing Node.js 18..."
if [ -x "$(command -v apt-get)" ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
elif [ -x "$(command -v yum)" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
else
    echo "Unsupported OS package manager"
    exit 1
fi

# Verify installation
node -v
npm -v

# 2. Install PM2
echo "Installing PM2..."
sudo npm install -g pm2

# 3. Setup Project Directory
echo "Setting up project..."
mkdir -p /www/wwwroot/alipay-api
cd /www/wwwroot/alipay-api

# 4. Clone/Update Code
if [ -d ".git" ]; then
    echo "Updating existing code..."
    git pull
else
    echo "Cloning repository..."
    git clone https://github.com/Lance-yan007/L-reader.git .
fi

# 5. Install Dependencies
echo "Installing project dependencies..."
# Copy server files to root if they are not there (handling structure)
if [ -d "api" ] && [ -f "server.js" ]; then
    echo "Files structure correct."
else
    echo "Warning: API structure check failed, ensure repo content is correct."
fi

npm install

# 6. Configure Environment Variables (Interactive)
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
PORT=3001
# Please edit this file with your actual keys later:
# ALIPAY_APP_ID=
# ALIPAY_PRIVATE_KEY=
# ALIPAY_PUBLIC_KEY=
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
EOF
    echo "⚠️  IMPORTANT: Please edit /www/wwwroot/alipay-api/.env to add your keys!"
fi

# 7. Start Server with PM2
echo "Starting server..."
pm2 start server.js --name alipay-api --watch
pm2 save
pm2 startup

echo "✅ Deployment Complete! Server running on port 3001."
echo "➡️  Next step: Edit .env file with your keys using 'nano .env' or 'vi .env'"
