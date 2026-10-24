import { B } from './B';

interface DashboardProps {
  title: string;
  user: string;
  role: string;
  theme: string;
  locale: string;
  unread: number;
  collapsed: boolean;
  onToggle: () => void;
}

// 组件 A（违例样本）：与 B 互相 import 形成循环依赖；嵌套深度 5 超阈值；props 8 个超阈值
export function A(props: DashboardProps) {
  return (
    <Wrapper>
      <Panel>
        <Section>
          <Row>
            <Cell>{props.title}</Cell>
          </Row>
        </Section>
      </Panel>
    </Wrapper>
  );
}
