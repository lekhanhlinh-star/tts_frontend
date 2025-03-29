# Sử dụng image Node chính thức
FROM node:16

# Đặt thư mục làm việc
WORKDIR /app

# Sao chép file package.json và package-lock.json (nếu có) trước
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Sao chép toàn bộ mã nguồn frontend vào container
COPY . .

# Nếu bạn muốn build production, bạn có thể dùng lệnh:
# RUN npm run build
# và sau đó có thể sử dụng một server tĩnh (Nginx) để chạy.
# Ở đây để đơn giản, ta sẽ chạy lệnh start dev:
CMD ["npm", "start"]
