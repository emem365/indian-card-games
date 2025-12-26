# Use official lightweight Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app code
COPY . .

# Expose the standard port (though Cloud Run overrides this via PORT env)
EXPOSE 3000

# Start command
CMD ["npm", "start"]
