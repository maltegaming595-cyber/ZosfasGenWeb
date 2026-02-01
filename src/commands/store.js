const { LINKS } = require('../config');
module.exports={async handle(i){await i.reply({content:LINKS.STORE||'Store link not configured.',ephemeral:true});}};
