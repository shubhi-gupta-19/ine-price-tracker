import sgMail from "@sendgrid/mail";
import { supabase } from "../config/supabase.js";

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function getUsersTrackingProduct(productId) {
    const { data, error } = await supabase.from("user_product_configs").select(`
            *,
            user_configs (
                email,
                email_alerts_enabled,
                send_price_drop_alerts,
                send_back_in_stock_alerts
            )
        `).eq("product_id", productId).eq("enabled", true);
        
    if (error) { console.error(error); return []; }
    return data || [];
}

export async function sendPriceDropAlert({ product, oldPrice, newPrice }) {
    if (!process.env.SENDGRID_API_KEY) return;
    const users = await getUsersTrackingProduct(product.id);
    for (const item of users) {
        const settings = item.user_configs;
        if (!settings || !settings.email_alerts_enabled || !settings.send_price_drop_alerts || !item.price_drop_alert_enabled) continue;
        
        try {
            await sgMail.send({
                to: settings.email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: `Price Drop: ${product.name}`,
                text: `${product.name} dropped in price.\n\nOld price: ${oldPrice}\nNew price: ${newPrice}\n\nProduct: ${product.url}`
            });
        } catch (error) {
            console.error("Price alert failed:", error.message);
        }
    }
}

export async function sendBackInStockAlert({ product }) {
    if (!process.env.SENDGRID_API_KEY) return;
    const users = await getUsersTrackingProduct(product.id);
    for (const item of users) {
        const settings = item.user_configs;
        if (!settings || !settings.email_alerts_enabled || !settings.send_back_in_stock_alerts || !item.back_in_stock_alert_enabled) continue;
        
        try {
            await sgMail.send({
                to: settings.email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: `Back in Stock: ${product.name}`,
                text: `${product.name} is back in stock.\n\nProduct: ${product.url}`
            });
        } catch (error) {
            console.error("Stock alert failed:", error.message);
        }
    }
}