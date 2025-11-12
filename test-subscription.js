// 订阅功能测试脚本
// 在应用控制台（开发者工具）中执行

async function testSubscription() {
    console.log('🧪 开始测试订阅功能...\n');
    
    // 1. 检查 Supabase 连接
    if (!window.supabaseClient) {
        console.error('❌ Supabase 客户端未初始化');
        return;
    }
    console.log('✅ Supabase 客户端已连接\n');
    
    // 2. 获取当前用户
    const { data: { user }, error: userError } = await window.supabaseClient.auth.getUser();
    if (userError || !user) {
        console.error('❌ 未登录，请先登录');
        return;
    }
    console.log('✅ 用户已登录:', user.email);
    console.log('   用户ID:', user.id, '\n');
    
    // 3. 检查 SubscriptionHelper
    if (!window.SubscriptionHelper) {
        console.error('❌ SubscriptionHelper 未加载');
        return;
    }
    const helper = new window.SubscriptionHelper(window.supabaseClient);
    console.log('✅ SubscriptionHelper 已初始化\n');
    
    // 4. 获取订阅状态
    console.log('📊 获取订阅状态...');
    const subscription = await helper.getSubscriptionStatus(user.id);
    console.log('   订阅类型:', subscription.planType);
    console.log('   订阅详情:', subscription.subscription || '无');
    console.log('   限制配置:', SubscriptionHelper.LIMITS[subscription.planType], '\n');
    
    // 5. 获取今日使用量
    console.log('📊 获取今日使用量...');
    const usage = await helper.getTodayUsage(user.id);
    console.log('   点词翻译:', usage.wordTranslations);
    console.log('   AI助手:', usage.aiChatCount);
    console.log('   生词本:', usage.vocabularyCount, '\n');
    
    // 6. 获取生词本总数
    console.log('📊 获取生词本总数...');
    const vocabularyCount = await helper.getVocabularyCount(user.id);
    console.log('   生词本总数:', vocabularyCount, '\n');
    
    // 7. 测试限制检查
    console.log('🧪 测试限制检查...');
    
    // 点词翻译
    const wordLimitCheck = helper.checkFeatureLimit(
        subscription.planType,
        'wordTranslations',
        usage
    );
    console.log('   点词翻译限制检查:');
    console.log('     允许:', wordLimitCheck.allowed);
    console.log('     剩余:', wordLimitCheck.remaining);
    console.log('     限制:', wordLimitCheck.limit);
    
    // AI助手
    const aiLimitCheck = helper.checkFeatureLimit(
        subscription.planType,
        'aiChat',
        usage
    );
    console.log('   AI助手限制检查:');
    console.log('     允许:', aiLimitCheck.allowed);
    console.log('     剩余:', aiLimitCheck.remaining);
    console.log('     限制:', aiLimitCheck.limit);
    
    // 生词本
    const vocabLimit = SubscriptionHelper.LIMITS[subscription.planType].vocabulary;
    console.log('   生词本限制检查:');
    console.log('     当前:', vocabularyCount);
    console.log('     限制:', vocabLimit === Infinity ? '无限' : vocabLimit);
    console.log('     允许:', vocabLimit === Infinity || vocabularyCount < vocabLimit);
    console.log('     剩余:', vocabLimit === Infinity ? '无限' : Math.max(0, vocabLimit - vocabularyCount), '\n');
    
    // 8. 测试完整检查流程
    console.log('🧪 测试完整检查流程（不实际更新使用量）...');
    console.log('   注意：这会检查限制，但不会更新使用量\n');
    
    console.log('✅ 测试完成！');
    console.log('\n📝 下一步：');
    console.log('1. 在应用中测试点词翻译（点击单词）');
    console.log('2. 在应用中测试 AI 助手（发送消息）');
    console.log('3. 在应用中测试生词本（保存翻译）');
    console.log('4. 打开个人中心查看订阅状态和使用量');
    console.log('\n💡 提示：');
    console.log('- 在 Supabase SQL Editor 中执行 test-subscription.sql 来创建测试订阅');
    console.log('- 使用量会在实际使用功能时自动更新');
    
    return {
        userId: user.id,
        subscription,
        usage,
        vocabularyCount,
        wordLimitCheck,
        aiLimitCheck
    };
}

// 执行测试
testSubscription().then(result => {
    console.log('\n📦 测试结果已返回，可在控制台查看详细信息');
}).catch(error => {
    console.error('❌ 测试失败:', error);
});

