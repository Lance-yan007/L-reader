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
ALIPAY_APP_ID=2021006115675047
ALIPAY_PRIVATE_KEY=MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCwEh2mN3EbJoTNS/ZRdrTT9Xn9TbABK0EIuEh1cvbdiN5hQ1QaJQGTLj66yKT5XECDAwJyzys4A57WvfJYZYc24EHakXkEqECy7cOHMaZLOzitof6+qniZIIXuSroC6QRK21Ln47xrcqJTO95N7Ob8zZ4Bf9jTwFEBoLyyKKsOMS+LDVvrZOQ4pGN896S9s1jL8yEQgH+PMyL0SOcL0NdEWgcn4OYFvzemXiwC8KCBE8ZuuMz6b2hGYgOrkffD/+D1ZBRf70mT52/xVhI42X4Fi3CrX9UTjd05sC+X3rSLl45t51zM0gmGwoVkNePq0/EYN/3URPD6w6z1UByojPjlAgMBAAECggEAGr61uEDlsm0YcSLfyKISd7vrCtoZKSRL3ao4f3a2HxKiTP3wMYR7h8LXjoHZ5XLo7b2wSoZDl1+dahsyS9EoR+KqviuoyVdRdJx/PfMBwp29T0qzKn00knYJQhghxz1kBIbqQgUq4ttn4uLOMuIQeEg3fxzPb+LfqzKiVyGsUhxPVrFylmo90FWrqApw1Ni/POcdIwZZKOYHLhUPrCVzSyBe9HP+jZHeLYZxYSa3oi0okYFKj4K5tQHj1R7azp22z4Tyhn2OvSCt2JrR9nuNjPSHPhM/SKyhTn/DgEx/1xyG42FfqvM3Zc5+owMFdlms0UUdWFzZxKiCJT4OyEjLRQKBgQD2jYmU7xMR1sW4W2Mw8EYLMeSwIPqXPr8GmRbA8RwOlxCLTVhNAfuXbd4qCVJYlOZt76XZPb91lxtXbMYqNzymBhoO2229fz6+1QAg24EjIFAKPxWjUuAKxHZ1iKNO4gubiSYLJulnaBYE4INbqAXPvWbHt55Kd039SZDJj4HrjwwKBgQC20TZJ4dY55iOWO1Ge19pIwCHhl7eV45gVxSoHa42iHTx4NN/MsFTf7ySQqAUSfO+vmqutE0pdg7/tM/O9xiWOYFDi8cN8+KrBoOf037a+UFIf6Xmt8NNbWJtABXrYJRIikMCO8wWqHesDoEPVfRUk35Hz6Gw4a/JTX3Qta1MuNwKBgGM8MKYbW+eQNGCxl8j4zJhw6oThoTsC7EwxjfD2mr5cmzIWXXYRWDxo4kS1H8m7lMum62/25Hrl6QFVLKWNOgHw7sgQFlHP+/7N2QCNYX32X9mSMVF9BshXDSOXHzBir59gyx16vfN8x7fZr+bb0tgBmBYTYPXZTKPS5F1C2vOVAoGAHEhzqKx6swxqtwRIVVW5nIW0+Cy7p0HFtqCBJxK5n7n8L/CmKwmgp+BcfNCxsDGJ91Xrd2RDngITAESIUfTEvKkj+mhCwSPLbxdQq26s2/abLfq163YVjM1Bf38ZiTT7AEP6tmLcnnvwbugtdmraiZDZCK4NiBETNVjQJXK0NLMCgYEAquSFefCv77u13d6Iu52Q8xrpKUdyCGi6Y8kpdYZx9Ie4YpPfcXQL7Ojv6j2VOv/M8h4Pg+IEpZJyvv95fDiWqO4MDZNf0HEfBikni7wZuD298wkV4xhQN2dcc1w7Avj38asSiObjMnBnlMTDZzeKaiu+GB4m23ILwVpO1hZupW4=
ALIPAY_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArnOWjZxs6C2DCKk1fj0a7oXBFEY/tY4GqYH3U/kqkW5mB7OSnICyBrsTBMr1/CEZHTrMm//UMA8BSone4qGECpy0czR4eDP+4RTbUmYWC+GQmeBJmT8dhJLJVKZ3yjNownA7Bm8SI0mqwnK+ZHkS/pHc/UJ8OlVS1CtlSGLko//7zWZeX2zdQyY+uNcfNFq3XUW3ceabipu61ktY2BiQS4UR7hc15HCbX/kABe+fMq7WFyw3C3gdultzTWIfzepAoCNeRvMV23jkvWnnsnoO8X9pjtClSlngy2gRefpvxnV5o7OuNkh0KCerMMHk+DA8lalNJp7/Zwsk6fiStsUqAwIDAQAB
SUPABASE_URL=https://rjmumvfwpbcvtkllcehm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqbXVtdmZ3cGJjdnRrbGxjZWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzg0MjU1OCwiZXhwIjoyMDc5NDE4NTU4fQ.fFYq16KbirhHVM44oxRzI4TGCx2GcrMPHV4avX5bvsQ
EOF

# 7. Start Server with PM2
echo "Starting server..."
pm2 start server.js --name alipay-api --watch
pm2 save
pm2 startup

echo "✅ Deployment Complete! Server is running."
echo "➡️  You can check logs with: pm2 logs alipay-api"
