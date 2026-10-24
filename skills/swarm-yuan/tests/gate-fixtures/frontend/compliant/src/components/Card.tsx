interface CardProps {
  title: string;
  subtitle: string;
  onClick: () => void;
}

// 卡片（合规样本）：展示组件职责单一，嵌套深度 2、props 3 个，均低于阈值
export function Card(props: CardProps) {
  return (
    <Wrapper onClick={props.onClick}>
      <Panel>{props.title}</Panel>
    </Wrapper>
  );
}
