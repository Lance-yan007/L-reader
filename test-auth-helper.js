// 测试 auth-helper 模块是否能正确加载
const path = require('path');

console.log('🔍 测试 auth-helper 模块加载...\n');

// 模拟 Electron 环境中的路径
const scriptDir = __dirname;
const scriptsDir = path.join(scriptDir, 'src/scripts');
const utilsDir = path.join(scriptDir, 'src/utils');

console.log('当前目录:', scriptDir);
console.log('scripts 目录:', scriptsDir);
console.log('utils 目录:', utilsDir);
console.log('');

// 测试路径1：从 scripts 目录加载 utils
console.log('测试1: 从 scripts 目录加载 utils/auth-helper.js');
try {
    const authHelperPath1 = path.join(scriptsDir, '../utils/auth-helper.js');
    console.log('  路径:', authHelperPath1);
    const authHelper1 = require(authHelperPath1);
    console.log('  ✅ 成功加载');
    console.log('  导出内容:', Object.keys(authHelper1));
} catch (e) {
    console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试路径2：从项目根目录加载
console.log('测试2: 从项目根目录加载 src/utils/auth-helper.js');
try {
    const authHelperPath2 = path.join(scriptDir, 'src/utils/auth-helper.js');
    console.log('  路径:', authHelperPath2);
    const authHelper2 = require(authHelperPath2);
    console.log('  ✅ 成功加载');
    console.log('  导出内容:', Object.keys(authHelper2));
} catch (e) {
    console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试路径3：相对路径
console.log('测试3: 使用相对路径（从 scripts 目录）');
try {
    // 模拟在 scripts 目录中
    process.chdir(scriptsDir);
    const authHelper3 = require('../utils/auth-helper');
    console.log('  ✅ 成功加载');
    console.log('  导出内容:', Object.keys(authHelper3));
    process.chdir(scriptDir); // 恢复
} catch (e) {
    console.log('  ❌ 失败:', e.message);
    process.chdir(scriptDir); // 恢复
}

console.log('\n✨ 测试完成！');
console.log('\n📝 在 Electron 中，__dirname 应该指向 src/scripts/ 目录');
console.log('   所以路径 ../utils/auth-helper.js 应该能找到文件');

