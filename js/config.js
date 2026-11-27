/*
 * Supabase connection for the site copy (project "product_selection").
 * The publishable key is meant to be public: what it can do is limited by the
 * row-level-security policies on public.site_content (anyone may read; only
 * accounts listed in public.site_admins may write).
 */
window.GPLUS_CONFIG = {
  supabaseUrl: "https://hnyodpsdfvipbvrsgflb.supabase.co",
  supabaseKey: "sb_publishable_jGPsb-rFBAjpYz30eVMzFA_hiB_ONzQ",
  table: "site_content",
};
