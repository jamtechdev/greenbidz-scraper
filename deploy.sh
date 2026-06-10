#!/bin/bash

echo "Pulling latest code..."
git pull origin main --rebase

echo "Installing backend..."
cd Backend && npm install && npm run build

echo "Building frontend..."
cd ../Frontend && npm install && npm run build

echo "Restarting PM2..."
pm2 restart all

echo "Deploy completed"
