const { LINKS } = require('../config');
module.exports={async handle(i){await i.reply({content:LINKS.ONLINE||'Online-fix link not configured.',ephemeral:true});}};
