const discord = require("discord.js");
const fs = require("fs");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { Client } = require("pg");

let slowmodes = [];

const db = new Client({connectionString: process.env.DATABASE});

const client = new discord.Client({
    intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.MessageContent,
    ],
})

const slowmodeCommand = new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Applies a slowmode to the stated user")
    .addUserOption(option => 
        option
            .setName("target")
            .setDescription("The user you would like to slowmode")
            .setRequired(true))
    .addIntegerOption(option =>
        option
            .setName("duration")
            .setDescription("Slowmode duration in seconds")
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)

const clearSlowmodeCommand = new SlashCommandBuilder()
    .setName("clearslowmode")
    .setDescription("Clears slowmode from a user")
    .addUserOption(option => 
        option
            .setName("target")
            .setDescription("The user you would like to remove slowmode from")
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)

const showSlowmodesCommand = new SlashCommandBuilder()
    .setName("getslowmodes")
    .setDescription("Gets all users with slowmode applied")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)


client.once("clientReady", async () => {
    try {
        await client.application.commands.set([slowmodeCommand, clearSlowmodeCommand, showSlowmodesCommand]);
        console.log("Slash commands registered successfully!");
    } catch (error) { console.error("Error registering slash commands:", error);}
    try {
        await db.connect();

        const slowmode_list = await db.query("SELECT * FROM slowmode_users");

        for (const i of slowmode_list.rows) {
            slowmodes.push({
                user: i["id"],
                channel: i["channel_id"],
                milli: i["slowmode_ms"]
            });
        }

        console.log("Slowmode User list successfully initialized from database.")
    } catch (error) {
        console.error("Error getting users from database:", error);
    }
    console.log("Bot started.");
});

client.login(process.env.TOKEN);

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "slowmode") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && interaction.user.id != process.env.SPECIAL_ID) {
            return await interaction.reply({ 
                content: "You need Administrator permissions to use this command.", 
                flags: discord.MessageFlags.Ephemeral 
            });
        }
        const targetUser = interaction.options.getUser("target");
        const seconds = interaction.options.getInteger("duration");
        const msSlowMode = (seconds * 1000);
        const channelId = interaction.channel.id;
        try {
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({
                    content: "You cannot slowmode an Administrator.",
                    flags: discord.MessageFlags.Ephemeral
                });
            }
            slowmodes = slowmodes.filter(
                value => !(value.user === targetUser.id && value.channel === channelId)
            );
            slowmodes.push({
                user: targetUser.id,
                channel: channelId,
                milli: msSlowMode
            });

            console.log(`Added slowmode to ${targetMember.user.tag} for ${seconds} seconds`);

            await db.query("DELETE FROM slowmode_users WHERE id = $1",[targetUser.id]);
            await db.query("INSERT INTO slowmode_users (id, channel_id, slowmode_ms) VALUES ($1, $2, $3)",[targetUser.id, channelId, msSlowMode]);
            
            return await interaction.reply({ 
                content: `Slowmode enabled for ${discord.userMention(targetUser.id)}. They will be timed out for ${seconds} seconds if they send a message in this channel.`
            });
        } catch (error) {
            console.error("Error setting slowmode:", error);
            return await interaction.reply({
                content: "An error occurred while setting the slowmode.",
                flags: discord.MessageFlags.Ephemeral 
            });
        }
    }
    if (interaction.commandName === "clearslowmode") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && interaction.user.id != process.env.SPECIAL_ID) {
            return await interaction.reply({ 
                content: "You need Administrator permissions to use this command.", 
                flags: discord.MessageFlags.Ephemeral 
            });
        }
        const targetUser = interaction.options.getUser("target");
        const member = await interaction.guild.members.fetch(targetUser);
        var found = false;
        try {
            for (const slowmode of slowmodes) {
                if (targetUser.id == slowmode.user) {
                    try {
                        found = true;
                        await member.timeout(null, "Slowmode cleared by command");
                        console.log(`Removed timeout from ${member.user.tag}`);
                        await db.query("DELETE FROM slowmode_users WHERE id = $1",[targetUser.id]);
                    } catch (error) {
                        console.error(`Error removing timeout from user ${slowmode.user}:`, error);
                        return;
                    }
                    break;
                }
            }
            if (found) {
                slowmodes = slowmodes.filter( value => !(value.user === targetUser.id));
                return await interaction.reply({ 
                    content: `Cleared slowmode from ${discord.userMention(targetUser.id)}.`
                });
            } else {
                return await interaction.reply({ 
                    content: `${discord.userMention(targetUser.id)} is not currently in slowmode.`,
                    flags: discord.MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            console.error("Error clearing slowmode:", error);
            return await interaction.reply({
                content: "An error occurred while clearing slowmode.",
                flags: discord.MessageFlags.Ephemeral 
            });
        }
    }
    if (interaction.commandName === "getslowmodes") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && interaction.user.id != process.env.SPECIAL_ID) {
            return await interaction.reply({ 
                content: "You need Administrator permissions to use this command.", 
                flags: discord.MessageFlags.Ephemeral 
            });
        }
        var foundThing = false;
        var string = "The following users are in slowmode:\n";
        for (const slowmode of slowmodes) {
            var cur_chan;
            try {
                cur_chan = await interaction.guild.channels.fetch(`${slowmode.channel}`);
            } catch (error) { continue;}
            if (cur_chan == null) { continue;}
            foundThing = true;
            string += (`${discord.userMention(slowmode.user)} in channel #${cur_chan.name} for ${(slowmode.milli)/1000} seconds\n`)
        }
        if (!foundThing) {
            return await interaction.reply({
                content: "No one is in slowmode",
                flags: discord.MessageFlags.Ephemeral
            });
        }
        try {
            return await interaction.reply({
                content: string,
            });
        } catch (error) {
            console.error("Error getting slowmode:", error);
            return await interaction.reply({
                content: "An error occurred while getting slowmodes.",
                flags: discord.MessageFlags.Ephemeral 
            });
        }
    }
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    var isSlowmoded = false;
    var slowmodeTime;
    for (const slowmode of slowmodes) {
        if (slowmode.user == msg.author.id && slowmode.channel == msg.channel.id) { 
            isSlowmoded = true;
            slowmodeTime = slowmode.milli;
        }
    }

    if (isSlowmoded) {
        try {
            const member = await msg.guild.members.fetch(msg.author.id);
            return await member.timeout(slowmodeTime,"Member is currently in slowmode.");
        }
        catch (error) {
            console.error("Error applying timeout:");
        }
    }
});

