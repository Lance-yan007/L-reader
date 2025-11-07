// 测试模块加载（模拟 Electron 环境）
const path = require('path');

console.log('🔍 测试模块加载路径...\n');

// 模拟 auth.js 的位置（src/scripts/auth.js）
const scriptsDir = path.join(__dirname, 'src/scripts');
const utilsDir = path.join(__dirname, 'src/utils');

console.log('模拟环境：');
console.log('  scripts 目录:', scriptsDir);
console.log('  utils 目录:', utilsDir);
console.log('');

// 测试1：从 scripts 目录加载 utils/supabase.js
console.log('测试1: 从 scripts 目录加载 utils/supabase.js');
try {
    // 模拟 __dirname 为 scripts 目录
    const mockDirname = scriptsDir;
    const supabasePath = path.join(mockDirname, '../utils/supabase.js');
    console.log('  模拟 __dirname:', mockDirname);
    console.log('  构建的路径:', supabasePath);
    
    const supabaseModule = require(supabasePath);
    console.log('  ✅ 成功加载');
    console.log('  导出内容:', Object.keys(supabaseModule));
    
    // 测试 supabase 客户端是否可用
    if (supabaseModule.supabase) {
        console.log('  ✅ supabase 客户端可用');
    } else {
        console.log('  ❌ supabase 客户端不可用');
    }
} catch (e) {
    console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试2：从 scripts 目录加载 utils/auth-helper.js
console.log('测试2: 从 scripts 目录加载 utils/auth-helper.js');
try {
    const mockDirname = scriptsDir;
    const authHelperPath = path.join(mockDirname, '../utils/auth-helper.js');
    console.log('  模拟 __dirname:', mockDirname);
    console.log('  构建的路径:', authHelperPath);
    
    const authHelperModule = require(authHelperPath);
    console.log('  ✅ 成功加载');
    console.log('  导出内容:', Object.keys(authHelperModule));
    
    // 测试 authHelper 是否可用
    if (authHelperModule.authHelper) {
        console.log('  ✅ authHelper 可用');
        console.log('  方法:', Object.keys(authHelperModule.authHelper));
    } else {
        console.log('  ❌ authHelper 不可用');
    }
} catch (e) {
    console.log('  ❌ 失败:', e.message);
}

console.log('\n✨ 测试完成！');
console.log('\n📝 结论：');
console.log('  在 Electron 中，如果 __dirname 指向 src/scripts/');
console.log('  使用 path.join(__dirname, "../utils/xxx.js") 应该可以成功加载模块');

