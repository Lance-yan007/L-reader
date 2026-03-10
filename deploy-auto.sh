#!/bin/bash

# Alipay API Server Deployment Script (FINAL VERSION)
# Run this on your Aliyun server:
# curl -fsSL https://raw.githubusercontent.com/Lance-yan007/L-reader/main/deploy-auto.sh | bash

# 1. Install Node.js 18
echo "Installing Node.js 18..."
if [ -x "$(command -v apt-get)" ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs git
elif [ -x "$(command -v yum)" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs git
else
    echo "Unsupported OS package manager"
    exit 1
fi

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
npm install

# 6. Configure Environment Variables (Using provided keys)
echo "Creating .env file..."
cat > .env << 'EOF'
PORT=3001
ALIPAY_APP_ID=YOUR_ALIPAY_APP_ID
ALIPAY_PRIVATE_KEY="YOUR_ALIPAY_PRIVATE_KEY"
ALIPAY_PUBLIC_KEY="YOUR_ALIPAY_PUBLIC_KEY"
SUPABASE_URL=https://rjmumvfwpbcvtkllcehm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# WeChat Pay Configuration (Fill these in manually on server)
WECHAT_MCH_ID=YOUR_MCH_ID
WECHAT_APP_ID=YOUR_APP_ID
WECHAT_API_V3_KEY=YOUR_API_V3_KEY
WECHAT_SERIAL_NO=YOUR_CERT_SERIAL_NO
WECHAT_PRIVATE_KEY="YOUR_PRIVATE_KEY_CONTENT_WITH_NEWLINES"
EOF

# 7. Start Server with PM2
echo "Starting server..."
pm2 start server.js --name alipay-api --watch
pm2 save
pm2 startup

echo "✅ Deployment Complete! Server is running."
echo "➡️  You can check logs with: pm2 logs alipay-api"
