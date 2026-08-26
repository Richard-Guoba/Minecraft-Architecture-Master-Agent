export function bilibiliCourseSnapshotFixture() {
  return {
    code: 0,
    message: 'OK',
    ttl: 1,
    data: {
      bvid: 'BV1HhEuzZEyZ',
      owner: {
        mid: 351448296,
        name: '黑辉极乐鸟'
      },
      rights: {
        download: 1,
        no_reprint: 1
      },
      ugc_season: {
        id: 4369851,
        title: '极乐鸟的建筑课堂',
        mid: 351448296,
        ep_count: 2,
        sections: [
          {
            season_id: 4369851,
            id: 4861616,
            title: '正片',
            type: 1,
            episodes: [
              episodeFixture({
                id: 98652025,
                aid: 113678489818718,
                cid: 27418560409,
                bvid: 'BV1fNkgYBEyy',
                curriculumTitle: '1.1结构入门',
                publishedTitle: '结构为王【萌新也能学会的建筑教程01】',
                duration: 587,
                pubdate: 1734596272,
                view: 645679
              }),
              episodeFixture({
                id: 124086363,
                aid: 114487721991793,
                cid: 29903029909,
                bvid: 'BV1HhEuzZEyZ',
                curriculumTitle: '1.2结构主次',
                publishedTitle: '还在做这样的火柴盒？结构主次很重要！',
                duration: 781,
                pubdate: 1746944865,
                view: 217767,
                embeddedDownload: 0,
                embeddedNoReprint: 0
              })
            ]
          }
        ]
      }
    }
  };
}

function episodeFixture({
  id,
  aid,
  cid,
  bvid,
  curriculumTitle,
  publishedTitle,
  duration,
  pubdate,
  view,
  embeddedDownload = 1,
  embeddedNoReprint = 1
}) {
  return {
    season_id: 4369851,
    section_id: 4861616,
    id,
    aid,
    cid,
    title: curriculumTitle,
    attribute: 0,
    arc: {
      aid,
      state: 0,
      duration,
      pubdate,
      rights: {
        download: embeddedDownload,
        no_reprint: embeddedNoReprint
      },
      author: {
        mid: 351448296,
        name: '黑辉极乐鸟'
      },
      stat: {
        view,
        like: Math.floor(view / 10),
        reply: Math.floor(view / 100)
      }
    },
    page: {
      cid,
      page: 1,
      from: 'vupload',
      part: publishedTitle,
      duration
    },
    bvid,
    pages: [
      {
        cid,
        page: 1,
        from: 'vupload',
        part: publishedTitle,
        duration
      }
    ]
  };
}
