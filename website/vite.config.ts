import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages 项目页挂在 /svg-infovis/ 下; fs.allow 放行仓根(示例源码 ?raw 与内核实时演示都要越目录读)
export default defineConfig({
  base: '/svg-infovis/',
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5180 },
});
