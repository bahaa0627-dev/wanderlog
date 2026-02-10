// Supabase Edge Function: 删除用户账号及相关数据

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 获取用户认证信息
    const authHeader = req.headers.get('Authorization')!
    
    // 使用普通客户端验证用户身份
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: '用户未登录' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = user.id

    // 使用 Service Role 客户端执行删除操作
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. 删除用户相关的数据表记录
    // 删除用户的打卡记录
    await supabaseAdmin
      .from('check_ins')
      .delete()
      .eq('user_id', userId)

    // 删除用户的收藏
    await supabaseAdmin
      .from('collections')
      .delete()
      .eq('user_id', userId)

    // 删除用户的心愿单
    await supabaseAdmin
      .from('wishlists')
      .delete()
      .eq('user_id', userId)

    // 删除用户的行程
    await supabaseAdmin
      .from('trips')
      .delete()
      .eq('user_id', userId)

    // 删除用户的推荐地点
    await supabaseAdmin
      .from('user_recommendations')
      .delete()
      .eq('user_id', userId)

    // 删除用户的反馈
    await supabaseAdmin
      .from('feedbacks')
      .delete()
      .eq('user_id', userId)

    // 2. 删除 auth.users 中的用户记录
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Failed to delete user:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Delete failed', message: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: '账号已成功删除' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Delete account error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
