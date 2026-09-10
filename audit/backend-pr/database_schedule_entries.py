    def schedule_entries(self) -> List[dict]:
        """字段化全部日程（纯静态红标数据，不依赖账号/登录）。半月刊 module 与网站 API 共用此单一来源。
        每条：{key, category, start_time, end_time, description}
        - key: 稳定唯一标识，通知侧用它做已读去重
        - category: 语义类别（公会战/特别地下城/庆典/活动/...），调用方按需过滤
        - description: 与半月刊渲染文本一致的展示文案
        """
        from ..module.modules.nologin import (
            ClanBattlePeriod, SecretDungeonSchedule, GachaDatum, CampaignSchedule,
            CampaignFreegacha, HatsuneSchedule, TowerSchedule, TdfSchedule,
            ColosseumScheduleData, DomeScheduleData, AbyssSchedule, CaravanSchedule,
            CharaFortuneSchedule, LoginBonusDatum, SeasonpassFoundation,
        )

        # (来源表, 行主键字段, 工厂)；与 half_schedule.schedule_sources() 同一清单
        sources = [
            (self.clan_battle_period, 'clan_battle_id', lambda x: ClanBattlePeriod(x.start_time, x.end_time, "公会战")),
            (self.clan_battle_period, 'clan_battle_id', lambda x: ClanBattlePeriod(x.result_start, x.result_end, "公会战排名公示")),
            (self.secret_dungeon_schedule, 'dungeon_area_id', lambda x: SecretDungeonSchedule(x.start_time, x.end_time, "特别地下城")),
            (self.seasonpass_foundation, 'name', lambda x: SeasonpassFoundation(x.name, x.start_time, x.end_time, "季卡")),
            (self.gacha_data, 'gacha_id', lambda x: GachaDatum(x.gacha_id, x.exchange_id, x.start_time, x.end_time, "扭蛋")),
            (self.campaign_schedule, 'id', lambda x: CampaignSchedule(x.id, x.campaign_category, x.value, x.start_time, x.end_time, "庆典")),
            (self.campaign_free_gacha, 'campaign_id', lambda x: CampaignFreegacha(x.campaign_id, x.start_time, x.end_time, "免费十连")),
            (self.hatsune_schedule, 'event_id', lambda x: HatsuneSchedule(x.event_id, x.start_time, x.end_time, "活动")),
            (self.seven_schedule, 'event_id', lambda x: HatsuneSchedule(x.event_id, x.start_time, x.end_time, "活动")),
            (self.tower_schedule, None, lambda x: TowerSchedule(x.start_time, x.end_time, "露娜塔")),
            (self.tdf_schedule, None, lambda x: TdfSchedule(x.start_time, x.end_time, "次元断层")),
            (self.chara_fortune_schedule, 'name', lambda x: CharaFortuneSchedule(x.name, x.start_time, x.end_time, "赛马")),
            (self.login_bonus_data, 'name', lambda x: LoginBonusDatum(x.name, x.start_time, x.end_time, "登录奖励")),
            (self.colosseum_schedule_data, None, lambda x: ColosseumScheduleData(x.start_time, x.end_time, "斗技场")),
            (self.caravan_schedule, 'season_id', lambda x: CaravanSchedule(x.season_id, x.start_time, x.end_time, "驾车游")),
            (self.dome_schedule_data, None, lambda x: DomeScheduleData(x.start_time, x.end_time, "新斗技场")),
            (self.abyss_schedule, 'talent_id', lambda x: AbyssSchedule(x.talent_id, x.start_time, x.end_time, "深渊讨伐战")),
        ]

        entries: List[dict] = []
        counters: Counter = Counter()
        for table, key_field, factory in sources:
            for row_key, row in table.items():
                schedule = factory(row)
                if not schedule.enabled:
                    continue
                desc = schedule.get_description()
                # 扭蛋条目：官方池名 gacha_name 含 フェス/FES 判定为 fes 池，织入标记供通知侧折叠（只留第一人 + fes扭蛋）
                if schedule.description == "扭蛋":
                    gacha_name = getattr(row, 'gacha_name', '') or ''
                    if ('フェス' in gacha_name) or ('FES' in gacha_name.upper()):
                        desc = 'fes|' + desc
                # key = 语义类别 + 来源主键（无主键表用行键）；同主键多来源（公会战/排名公示）加序号
                base_key = ':'.join([schedule.description, str(row_key if key_field is None else getattr(row, key_field, row_key))])
                counters[base_key] += 1
                stable_key = base_key if counters[base_key] == 1 else base_key + '#' + str(counters[base_key])
                entries.append({
                    'key': stable_key,
                    'category': schedule.description,
                    'start_time': self.format_date(self.parse_time(schedule.start_time)),
                    'end_time': self.format_date(self.parse_time(schedule.end_time)),
                    'description': desc,
                })
        entries.sort(key=lambda e: (e['start_time'], e['key']))
        return entries

