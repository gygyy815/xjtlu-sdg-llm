"use client";

import { skillRegistry, type SkillId } from "@/lib/skills/registry";

type Props = {
  selected: SkillId | "";
  onSelect: (id: SkillId | "") => void;
  onFileSkill: () => void;
};

export function SkillCenter({ selected, onSelect, onFileSkill }: Props) {
  function choose(id: SkillId) {
    if (id === "file-fill") {
      onSelect(id);
      onFileSkill();
      return;
    }
    onSelect(selected === id ? "" : id);
  }

  return (
    <aside className="skillRail">
      <div className="skillRailHeader">
        <div>
          <span>SKILL CENTER</span>
          <h2>技能中心</h2>
        </div>
        <button type="button" onClick={() => onSelect("")}>清除</button>
      </div>
      <p className="skillHint">选择一个技能后，它会作为当前对话的执行方式。SDG 打标暂未加入本版本。</p>
      <div className="skillSearch">⌕ <span>搜索技能（下一版）</span></div>
      <div className="skillList">
        {skillRegistry.map((skill) => (
          <button
            type="button"
            key={skill.id}
            className={`skillCard ${selected === skill.id ? "selected" : ""}`}
            onClick={() => choose(skill.id)}
          >
            <span className={`skillIcon ${skill.id}`}>{skill.icon}</span>
            <span className="skillCopy">
              <strong>{skill.name}</strong>
              <small>{skill.description}</small>
            </span>
            <span className="builtin">内置</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
