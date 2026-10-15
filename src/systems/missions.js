// Mission & Objective Progression Manager
export class MissionManager {
  constructor(app) {
    this.app = app;
    this.missions = this.createDefaultMissions();
  }

  createDefaultMissions() {
    return [
      {
        id: "m1_explore_oakvale",
        order: 1,
        title: "Mission 1: Explore Oakvale",
        description: "Begin your Starlight Festival evening in Oakvale Village and read the village noticeboard together.",
        status: "active",
        notifiedComplete: false,
        objectives: [
          {
            id: "read_village_sign",
            text: "Read the Oakvale Noticeboard",
            current: 0,
            target: 1,
            completed: false
          }
        ]
      },
      {
        id: "m2_gather_crystals",
        order: 2,
        title: "Mission 2: Gather Heart Crystals",
        description: "Collect all 8 glowing Heart Crystals scattered across the rooftops, forest canopy, and ravine.",
        status: "locked",
        notifiedComplete: false,
        objectives: [
          {
            id: "collect_8_crystals",
            text: "Collect Heart Crystals",
            current: 0,
            target: 8,
            completed: false
          }
        ]
      },
      {
        id: "m3_recover_memories",
        order: 3,
        title: "Mission 3: Recover Our Memories",
        description: "Discover the 3 golden Memory Shards hidden along your journey to unlock Scrapbook entries.",
        status: "locked",
        notifiedComplete: false,
        objectives: [
          {
            id: "collect_3_memories",
            text: "Discover Memory Shards",
            current: 0,
            target: 3,
            completed: false
          }
        ]
      },
      {
        id: "m4_find_lantern_keeper",
        order: 4,
        title: "Mission 4: Find the Lantern Keeper",
        description: "Speak with Lantern Keeper Mira outside her cottage in eastern Oakvale for guidance on crossing the ravine.",
        status: "locked",
        notifiedComplete: false,
        objectives: [
          {
            id: "talk_to_mira",
            text: "Speak with Lantern Keeper Mira",
            current: 0,
            target: 1,
            completed: false
          }
        ]
      },
      {
        id: "m5_repair_bridge",
        order: 5,
        title: "Mission 5: Repair the Broken Bridge",
        description: "Work together at the chasm: hold the West Stone Plate to materialize the Starlight Span, then lock the East Bank Winch.",
        status: "locked",
        notifiedComplete: false,
        objectives: [
          {
            id: "hold_west_plate",
            text: "Activate the West Stone Pressure Plate",
            current: 0,
            target: 1,
            completed: false
          },
          {
            id: "lock_east_winch",
            text: "Lock the East Bank Winch with Mira's Key",
            current: 0,
            target: 1,
            completed: false
          }
        ]
      },
      {
        id: "m6_light_shrine",
        order: 6,
        title: "Mission 6: Light the Starlight Shrine",
        description: "Reunite on the eastern sanctuary cliff and ignite the Starlight Couple Shrine together.",
        status: "locked",
        notifiedComplete: false,
        objectives: [
          {
            id: "ignite_shrine_together",
            text: "Stand together at the Starlight Shrine and activate it",
            current: 0,
            target: 1,
            completed: false
          }
        ]
      }
    ];
  }

  getMission(id) {
    return this.missions.find((m) => m.id === id) || null;
  }

  unlockMission(id, silent = false) {
    const m = this.getMission(id);
    if (m && m.status === "locked") {
      m.status = "active";
      if (!silent) {
        this.app.showQuestToast("NEW QUEST UNLOCKED", m.title);
      }
    }
  }

  setObjectiveProgress(missionId, objectiveId, newValue, silent = false) {
    const m = this.getMission(missionId);
    if (!m) return false;
    const obj = m.objectives.find((o) => o.id === objectiveId);
    if (!obj) return false;

    const clamped = Math.max(0, Math.min(obj.target, newValue));
    const prev = obj.current;
    const wasCompleted = obj.completed;
    obj.current = Math.max(prev, clamped);
    obj.completed = obj.current >= obj.target;

    const advanced = obj.current > prev && m.status !== "locked";

    const allDone = m.objectives.every((o) => o.completed);
    if (allDone && m.status !== "completed") {
      m.status = "completed";
      if (!m.notifiedComplete) {
        m.notifiedComplete = true;
        if (!silent) {
          this.app.showQuestToast("QUEST COMPLETED ♥", m.title);
        }
      }
      this.onMissionCompleted(m.id, silent);
    } else if (advanced && !wasCompleted && !silent) {
      this.app.showQuestToast(
        "OBJECTIVE UPDATED",
        `${obj.text} (${obj.current}/${obj.target})`
      );
    }

    if (this.app.hud) {
      this.app.hud.updateQuestHUD();
    }
    return advanced;
  }

  onMissionCompleted(missionId, silent = false) {
    if (missionId === "m1_explore_oakvale") {
      this.unlockMission("m2_gather_crystals", silent);
      this.unlockMission("m3_recover_memories", silent);
      this.unlockMission("m4_find_lantern_keeper", silent);
      this.syncCollectibleCounts(silent);
    } else if (missionId === "m4_find_lantern_keeper") {
      this.unlockMission("m5_repair_bridge", silent);
      if (this.app.storyFlags.plateActivatedOnce) {
        this.setObjectiveProgress("m5_repair_bridge", "hold_west_plate", 1, true);
      }
      if (this.app.world.bridgeUnlockedPermanently) {
        this.setObjectiveProgress("m5_repair_bridge", "lock_east_winch", 1, silent);
      }
    } else if (missionId === "m5_repair_bridge") {
      this.unlockMission("m6_light_shrine", silent);
      if (this.app.world.shrineLit) {
        this.setObjectiveProgress("m6_light_shrine", "ignite_shrine_together", 1, silent);
      }
    }
  }

  syncCollectibleCounts(silent = false) {
    const crystalsCount = this.app.world.collectibles.filter((c) => c.type === "crystal" && c.collected).length;
    const memoriesCount = this.app.world.collectibles.filter((c) => c.type === "memory" && c.collected).length;

    const m2 = this.getMission("m2_gather_crystals");
    if (m2) {
      m2.objectives[0].current = crystalsCount;
      if (m2.status !== "locked") {
        this.setObjectiveProgress("m2_gather_crystals", "collect_8_crystals", crystalsCount, silent);
      }
    }

    const m3 = this.getMission("m3_recover_memories");
    if (m3) {
      m3.objectives[0].current = memoriesCount;
      if (m3.status !== "locked") {
        this.setObjectiveProgress("m3_recover_memories", "collect_3_memories", memoriesCount, silent);
      }
    }
  }

  getPrimaryTrackedMission() {
    const priorityOrder = [
      "m1_explore_oakvale",
      "m4_find_lantern_keeper",
      "m5_repair_bridge",
      "m6_light_shrine",
      "m2_gather_crystals",
      "m3_recover_memories"
    ];
    for (const id of priorityOrder) {
      const m = this.getMission(id);
      if (m && m.status === "active") return m;
    }
    return this.missions.find((m) => m.status === "active") || null;
  }

  serialize() {
    return this.missions.map((m) => ({
      id: m.id,
      status: m.status,
      notifiedComplete: Boolean(m.notifiedComplete),
      objectives: m.objectives.map((o) => ({
        id: o.id,
        current: Number(o.current) || 0,
        completed: Boolean(o.completed)
      }))
    }));
  }

  restore(savedMissions) {
    if (!Array.isArray(savedMissions)) return;
    for (const sm of savedMissions) {
      if (!sm || typeof sm.id !== "string") continue;
      const m = this.getMission(sm.id);
      if (!m) continue;
      if (["locked", "active", "completed"].includes(sm.status)) {
        m.status = sm.status;
      }
      m.notifiedComplete = Boolean(sm.notifiedComplete);
      if (Array.isArray(sm.objectives)) {
        for (const so of sm.objectives) {
          const obj = m.objectives.find((o) => o.id === so.id);
          if (obj && typeof so.current === "number" && !Number.isNaN(so.current)) {
            obj.current = Math.max(0, Math.min(obj.target, Math.floor(so.current)));
            obj.completed = Boolean(so.completed) || obj.current >= obj.target;
          }
        }
      }
    }
  }
}
