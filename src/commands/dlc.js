const { LINKS } = require('../config');
module.exports={async handle(i){await i.reply({content:LINKS.DLC||'DLC link not configured.',ephemeral:true});}};
