<!-- Standard Message Object -->

<ref *1> Message {
  channelId: '911011946579525693',
  guildId: '395142618939523073',
  id: '939050337602531349',
  createdTimestamp: 1643957447196,
  type: 'DEFAULT',
  system: false,
  content: 'ooh',
  author: User {
    id: '203380269883981825',
    bot: false,
    system: false,
    flags: UserFlags { bitfield: 0 },
    username: 'Frahbrah',
    discriminator: '2452',
    avatar: 'df9c76ba55f66b1746b018eab0c7bfbe',
    banner: undefined,
    accentColor: undefined
  },
  pinned: false,
  tts: false,
  nonce: '939050341784092672',
  embeds: [],
  components: [],
  attachments: Collection(0) [Map] {},
  stickers: Collection(0) [Map] {},
  editedTimestamp: null,
  reactions: ReactionManager { message: [Circular *1] },
  mentions: MessageMentions {
    everyone: false,
    users: Collection(0) [Map] {},
    roles: Collection(0) [Map] {},
    _members: null,
    _channels: null,
    crosspostedChannels: Collection(0) [Map] {},
    repliedUser: null
  },
  webhookId: null,
  groupActivityApplication: null,
  applicationId: null,
  activity: null,
  flags: MessageFlags { bitfield: 0 },
  reference: null,
  interaction: null
}

<!-- Custom Discord Emoji -->

<:pog:843174837732114502>



                    // can we not just structure the object a lil differently?

                    /*

                    [
                        {
                            456121651616549879616: {
                                global: {
                                    voice: 'Joanna',
                                    volume: 0.5,
                                }
                                guildID987968516321 {
                                    voice: 'Salli'


                                },
                                guildId {
                                    voice: 'Salli'

                                }

                                voice: {
                                    global: Salli
                                    guildID987968516321: Matthew
                                }
                            }
                        }
                    ]
                    
                    */

<!-- reconnection array structure -->

[
  {
    channelId: '954578428286369862',
    guildId: '395142618939523073',
    ttsChannel: '911011946579525693'
  }