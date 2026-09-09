# 外卡收单那点事儿之Visa篇（5）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-10-30 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

4.9  VCX 软件操作指南
4.9.1 下载与安装
4.9.1.1软件安装要求
硬件要求：
lCPU – 4CPU/4 CORE, 64bit
l磁盘– 500 GB
l内存– 32 GB
l通信协议– HTTPS
l文件传输协议– FTPS
操作系统：
lRed Hat Enterprise Linux-RHEL 8.0（最低版本）或9.4（最高版本）
lWindows Server 2022-标准核心
运行库要求：
lNodeJS – Version 20
lOpen JDK/Java – Version 21
lOpen SSL – 1.1.1
浏览器要求：
lGoogle Chrome-版本120（最低）或版本130（最高）
lMicrosoft Edge-版本120（最低）或版本130（最高）
数据库：
lPostgreSQL – Version 16.4
注：PostgreSQL设置将包含在Prerequisite Install脚本中。
S-Nail：
默认情况下，RHEL 9.0或更高版本使用S-Nail
注：从RHEL 9.0或更高版本开始，S-Nail将取代Mailx
对于Linux，VCX需要使用Mailx来进行双重身份验证（2FA）：
Mailx-版本12.5或更高版本（这是Linux 8或更高版本的默认版本）
SMTP Mail：
对于Windows，VCX需要使用SMTP邮件进行多因素身份验证（MFA）
Linux文件传输程序（LFTP）：
如果使用Linux，则VCX需要使用LFTP：LFTP版本4.4.8或更高版本（默认情况下在Linux上）
文件传输程序（FTP）：
VCX需要使用FTP for Windows：FTPS，即安全文件传输协议，是一种安全的文件传输协议，它使用加密技术并通过传输层安全（TLS）协议在网络上保护文件传输
PORT:
确保端口3000和8000已打开且可用于运行VCX服务
安装前置说明：
1.将下载下来的安装包拓展名从*.epd转成*.tgz
2.如果要在同一台服务器上安装PostgreSQL数据库，请在执行VCX-Pre-requisite软件安装程序时，为PostgreSQL数据库安装选择“是”选项。
3.如果要在单独的服务器上安装PostgreSQL DB，请在执行VCX-Pre-requisite软件安装程序时，为PostgreSQL DB install选择“否”选项。
4.在所选服务器上创建PostgreSQL数据库帐户，供VCX应用程序使用，并确保在PostgreSQL服务器和VCX应用程序服务器之间建立网络连接。创建PostgreSQL数据库帐户并设置PostgreSQL服务器与VCX应用程序服务器之间的网络连接后，请在VCX应用程序服务器上运行以下命令以验证连接是否成功。
5.在您的VCX应用程序服务器中，打开终端并键入以下命令“curl -v https://DBhostname:port”
6.成功的连接响应：
7.连接不成功响应
4.9.1.2 在Linux上安装
目录结构
Linux-Prerequisite-Software.tgz ──rhel/ 
│ ├──packages/ 
│ │ ├── node-v20.17.0-linux-x64.tar.gz 
│ │ ├── microsoft-jdk-21.0.4-linux-x64.tar.gz 
│ ├── install_prereqs.sh 
│ ├── licenses/
安装步骤：
1.创建文件夹并放置Linux-Prerequisite-Software.tgz文件
mkdir <folder_name> 
cd <folder_name> 
mv Linux-Prerequisite-Software.tgz <folder_name>
2.提取安装程序包
tar -xvf Linux-Prerequisite-Software.tgz
3.使用以下命令更新具有执行权限的install_prereqs.sh文件。
chmod +x ./install_prereqs.sh
4.以root权限执行脚本
<folder_name>/rhel ./install_prereqs.sh  
Starting the installation process at <datetime>  Node.js is not recognized on your system and may not be  installed.  
Would you like to install Node.js version 20.17.0 now? [Y/N]: Y  Installing Node.js. Please wait...  
Node.js has been successfully installed.  
Java is already installed on your system (version 17.0.13).  Your Java version is older than the required version.  
Would you like to install Java version 21.0.4 now? [Y/N]: Y  
Installing Java. Please wait...  
Java has been successfully installed.  
PostgreSQL is not recognized on your system.  
Would you like to install PostgreSQL version 16 now? [Y/N]: Y  
Checking if PostgreSQL version 16 is available for installation.  PostgreSQL version 16 is available. Proceeding with installation.  
Enabled PostgreSQL 16 AppStream successfully.  
PostgreSQL server installed successfully.  
PostgreSQL data directory is already initialized. Skipping  database initialization.  PostgreSQL service started successfully.  PostgreSQL service enabled to start on boot.  PostgreSQL service is running.  PostgreSQL is accessible and operational.  
These credentials will be used for authenticating the VCX  application to the PostgreSQL server.  
Enter the PostgreSQL username for the VCX application: 
<ENTER  USERNAME>  
Enter the PostgreSQL password for user 'vcxdb': 
<ENTER PASSWORD>  
Confirm password: 
<RE-ENTER PASSWORD>  
PostgreSQL user 
<USERNAME>
created successfully.  
Password for PostgreSQL user 
<USERNAME>
set successfully.  PostgreSQL service reloaded successfully to apply authentication  changes.  
VCX application PostgreSQL user setup completed successfully.  Installation ended at <datetime>. 
5.要刷新PATH环境变量，可以使用以下命令。
source /etc/profile
6.按照屏幕提示操作
该脚本将指导您完成安装过程。注意：如果服务器上已安装了必需的软件，则可以选择跳过这些安装：
lNode.js：安装版本20.17.0。
lOpenJDK：安装版本21.0.4。
lPostgreSQL 16：安装版本16.4并设置用户。
如果在安装过程中未检测到错误，则将显示一条类似的确认安装完成的消息：
Installation ended at Sat Nov 9 18:28:50 GMT 2024.
4.9.1.3 在Windows上安装
组件要求：
lNode.js
lOpenJDK
lOpenSSL
lPostgreSQL 16
目录结构：
Windows-Prerequisite-Software.tgz/ 
├── windows/ 
│ ├── installers/ 
│ │ ├── node-v20.17.0-x64.msi 
│ │ ├── microsoft-jdk-21.0.4-windows-x64.msi 
│ │ ├── postgresql-16.4-1-windows-x64.exe 
│ │ └── FireDaemon-OpenSSL-x64-3.3.2.exe 
│ ├── install_prereqs.ps1 
│ ├── licenses/
安装步骤：
1.创建文件夹并放置Windows-Prerequisite-Software.tgz文件
mkdir <folder_name> 
cd <folder_name> 
mv Windows-Prerequisite-Software.tgz <folder_name>
2.提取安装程序包
请确保将整个Windows-Prerequisite-Software目录提取到本地目录中，例如/opt/Windows-Prerequisite-Software
tar -xvf Windows-Prerequisite-Software.tgz
3.运行启动器脚本
3.1以管理员身份打开PowerShell使用GUI
3.1.1使用GUI：
右键单击PowerShell图标并选择以管理员身份运行。
3.1.2使用非GUI：从命令提示符以管理员身份打开PowerShell。
powershell -Command“Start-Process PowerShell -Verb Run as”
3.2执行启动器脚本：
Node.js is not installed. Do you want to install it? (Y/N): Y 
Installing Node.js, it may take a while, please wait... 
Node.js installed successfully. 
'C:\Program Files\nodejs' is already present in system PATH. 
Installed OpenJDK version: 11.0.20.1 
A newer version of OpenJDK (21.0.4) is available. Do you want 
to upgrade? (Y/N): Y 
Installing OpenJDK, it may take a while, please wait... 
OpenJDK installed successfully. 
'C:\Program Files\Microsoft\jdk-21.0.4' is already present in 
system PATH. 
Installed OpenSSL version: 1.0.2 
A newer version of OpenSSL (3.3.2) is available. Do you want 
to upgrade? (Y/N): Y 
Installing OpenSSL, it may take a while, please wait... 
OpenSSL installed successfully. 
'C:\Program Files\FireDaemon OpenSSL 3\bin' is already 
present in system PATH. 
OpenSSL installed successfully. Version: 3.3.2. 
PostgreSQL 16 is not installed. Do you want to install it? 
(Y/N): Y 
Please provide a password for the database superuser 
(postgres). 
password : ***** 
Retype password : ***** 
Please save your PostgreSQL superuser password securely for 
future logins. 
Installing PostgreSQL, it may take a while, please wait... 
PostgreSQL installed successfully. 
'C:\Program Files\PostgreSQL\16\bin' is already present in 
system PATH. 
PostgreSQL installed and service 'postgresql-x64-16' is 
running on port 5432. 
Installation process completed.
注：如果用户选择安装PostgreSQL，脚本将在同一服务器上安装PostgreSQL。
4.遵循屏幕提示
本脚本将指导您完成安装流程。注意：如果服务器上已安装了先决软件，您可以选择跳过以下安装步骤：
lNode.js：安装20.17.0版本；
lOpenJDK：安装21.0.4版本；
lOpenSSL：安装或升级至3.3.2版本；
lPostgreSQL 16：安装16.4版本并设置用户。
若安装过程中未检测到错误，系统将显示确认安装完成的消息：
Installation process completed.
注：可以在脚本目录中查看安装详细信息，路径为/windows/ Pre_req_install.log。
使用MFA注册VCX：
您必须首先在Visa Clearing Exchange（VCX）中设置主管理员帐户才能注册用户，这应在服务器上安装VCX后完成。所有其他用户必须在首次登录之前在VCX中注册。
1.登录页面点击“注册”按钮。
2.在必填栏中填写电子邮箱。
3.系统将向邮箱发送注册链接。
4.点击链接后页面会跳转至注册界面。
5.完成注册后点击确认。
完成VCX注册后，系统会显示绿色进度条提示注册成功。所有通过此方式注册的用户初始身份均为普通用户。主管理员及其他管理员可根据需要将普通用户升级为管理员。
不使用MFA注册VCX：
您必须首先在Visa Clearing Exchange（VCX）中设置主管理员帐户才能注册用户，这应在服务器上安装VCX后完成。所有其他用户必须在首次登录之前在VCX中注册。
1.从登录页面，单击注册。
2.在必需字段中输入您的姓名、电子邮件和密码。注意：密码必须至少有八个字符，包含至少一个数字、一个特殊字符、一个大写字母、一个小写字母，并且不能包含帐户名称。
3.在“确认密码”字段中再次输入您的密码。
4.单击“注册”。
将出现绿色栏，说明注册成功。所有用户以这种方式在VCX中注册时都是从操作员开始的。主管理员以及任何其他管理员都可以根据需要将操作员提升为管理员。
登录到VCX：
此步骤说明如何登录到Visa Clearing Exchange（VCX）。用户必须使用经批准的电子邮件和密码注册，并且在首次登录到Visa Clearing Exchange之前获得管理员的批准。
1.输入您的电子邮件。
2.输入您的密码。
3.单击登录。注：如果您是操作员，将被带到VCX主页。如果您是管理员，将被要求输入发送到您电子邮件中的一次性验证码。输入您的验证码并单击提交。然后，您将被带到VCX主页。
如果忘记密码：
4.单击密码字段下的“忘记密码？”
5.输入您注册VCX时使用的邮箱。
6.点击“下一步”。
7.输入发送到您邮箱的验证码。
8.点击“确认验证码”。
9.在输入框中填写新密码，确保符合所有密码要求。
10.在输入框中重复密码进行确认。
11.点击“更新密码”。
注意：若密码过期，您将按照“忘记密码”流程执行相同操作。若您在90天内未登录，您的账户（无论是运营商还是管理员）都将被停用。
如果您的操作员帐户被禁用：
12. 与管理员联系以重新激活操作员帐户。
如果您的管理员帐户被禁用：
13. 如果有另一个管理员，他们可以重新激活禁用的管理员帐户。、
14.如果没有分配其他管理员，或者主管理员离开应用团队时未传递应用密钥，则新管理员将无法登录，必须运行VCX的安装程序。
15.新管理员将收到关于创建新数据库（但不包含应用密钥）的警告。您必须同意。
16.从那里开始，按照管理员的设置流程操作。
4.9.1.3 基础设置配置
BASE Ⅱ CIB 设置
1.点击主界面Configuration 菜单按钮
2.点击CIB setup,进入CIB设置界面
3.如果没有设置过CIB，点击NEW BASE Ⅱ CIB，进入新增CIB界面
4.填写CIB 设置表单，注：Base II CIB，Security code，Center name由VISA提供
5.选择运行模式，可以选择测试、生产或测试和生产
6.点击保存，完成配置
Secure EAS 设置
1.点击主界面Configuration 菜单按钮
2.点击Secure EAS setup，进入EAS file transfer interface页面
3.如果没有设置过EAS file transfer interface，点击CREATE INTERFACE按钮，进入新增EAS file transfer interface界面
4.按照表单填写EAS FTP信息
5.点击验证接口，如果提示“EAS file transfer interface "VISA-FTPS-Test" has been verified.”则表示配置成功，否则请检查EAS信息是否填写有误
6.点击保存，完成EAS配置
Run control profiles配置
1.点击主界面Run Options菜单按钮
2.点击Run control profiles，进入Run control profiles页面
3.点击NEW RUN CONTROL PROFILE 选择INCOMING/OUTCOMING
4.以INCOMING为例，设置常规信息，配置文件名称和描述，设置Incoming interchange文件的拆分规则，可以选择None【默认】，Account Number Range，ACQ/ISS ID，Transaction Code，设置Incoming returned item file，用于设置卡组返回文件的格式，可以选择No Separate Returned File【默认】，Separate Returned File in CTF Format，Separate Returned File with TCR9，设置Center transaction file header，如果要将标头包含在传入中心事务文件中，选中该复选框。这个设置是可选的。
5.Pass options设置选择交易类别以查看可用于自定义的通行证选项。可用的通行证选项可能因类别而异。可选择传递选项的分类方式，例如“全部”、“通用”、“仅清算”等。
6.Transaction based reporting 设置界面，可以根据交易类别以选择查看可用于自定义的报告
7.点击保存，设置完毕
VCX Scheduler
1.点击主界面Configuration菜单按钮
2.点击Scheduler，进入VCX Scheduler设置界面
3.选择调度器频率设置，可以选择每日，每周，每月，现在，执行一次等设置
4.配置对应的时间频率执行时间
5.保存，完成设置
Batch procedures
1.点击主界面Batch procedure菜单按钮
2.点击Batch procedures,进入批量执行设置界面
3.点击ADD BATCH PROCEDURE,新建一个批量处理器
4.设置执行器名称，任务类型【incoming，outcoming】
5.选择运行后文件是否存档
6.运行环境选择，test 或者prod
7.是否生成调度器脚本
8.报告选项，根据需要选择是否需要设置生成对应报表
9.设置日志保存时间，返回码是什么时继续执行。
10.输出文件要不要转成EBCDIC格式
11.点击下一步，选择要执行的CIB，以及profile类型，文件路径
12.点击下一步，确认CIB设置相关信息是否正确
13.点击保存，完成设置
ps：如果需要手动执行任务则在Batch procedure页面能看到已经设置的调度器，点击run即可执行，点击 bath file run执行，任务将按照步骤执行，可以看到一个VIEW DETAILS查看日志，如果你执行的是transfer file 和run类型的定时任务，则会出现FTPS log 和batch log，里面会包含FTPS传输日志，以及批次执行的日志，从里面获取相关的报错信息或者执行日志。
4.9.2 VCX InComing and OutComing Processing
4.9.2.1 VCX InComing Processing
介绍：
传入的VCX运行处理在输入ITF文件中找到的每个交易。您可以定义运行控制概要文件，用于识别在存储库表中为传入处理定义的命名选项集。在处理流程结束时，若交换文件中未出现严重错误，控制程序将生成必要报告，并使客户处理中心可使用CTF文件。传入的VCX文件包含以下内容：
l财务与非财务交易数据
lVSS结算报告
lVCX表格更新
说明：为确保表格更新事务的正确应用，所有传入文件必须经过处理。文件需按创建时的中央处理日期（CPD）顺序处理，这样才能正确更新存储库表格及代码相关文件。
流程图：
流程概述：
1.BASEⅡ将Incoming ITF文件放入FTPS上
2.VCX 下载解析ITF文件并且生成CTF文件以及相关报表文件
3.收单机构解析CTF文件
4.9.2.2 VCX OutComing Processing
介绍：
外发流程会处理输入CTF文件中的每笔交易。通过运行控制配置文件，系统可识别存储库表中为外发处理定义的命名选项集。处理完成后，控制程序将生成所需报告。随后VCX系统会生成交换交易文件（ITF），该文件将传输至扩展访问服务器（EAS）、直接交换（DEX）开放文件交付（OFD）或Visa文件网关平台，并在这些平台上暂存直至预设的收集时间。
流程图：
流程概述：
1.收单机构上传CTF文件
2.VCX解析文件通过预编辑处理
3.VCX通过解析生成VCX拒绝的信息并且生成报告
4.成功的将生成ITF，并且上送至FTPS上
5.BASE Ⅱ获取OutComing ITF文件
4.10 请款文件示例
4.10.1 单个交易放在一个批次一个文件中上送：
9040122825251                TEST                             UKFF1234      010                                                                                         
05004005529999000255000Z  24012285251173946804055100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D032761  4 000000C
050530525129986058200000000010045800N6GG    0000 000000000100N                             000000000000000 0000000000000000000000000100A             0000000000000000   
910040122800000000000000000000000000000001600010000000000003000000        000000002000000000000000000000000000000100000000000000000000000000000000000000000000000       
920040122800000000000000000000000000000001000010000000000004000000        000000003000000000000000000000000000000100000000000000000000000000000000000000000000000       
4.10.2 多笔交易放在一个批次一个文件中上送：
9040122825251                TEST                             UKFF1234      009                                                                                         
05004229989999000012000Z  24012285251165303212500100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D060007  4 000000C
050530525130116511800000000010045800N28Q    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303630180100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D027620  4 000000C
0505305251301175169000000000100458004JT7    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303887723100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D046872  4 000000C
050530525130119522500000000010045800SXDR    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303854749100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D017607  4 000000C
05053052513012052770000000001004580085BJ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303298426100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D087607  4 000000C
050530525130121533900000000010045800P6P6    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303785463100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D000320  4 000000C
050530525130123538900000000010045800QJJC    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303369391100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D040320  4 000000C
050530525130125543900000000010045800Z4LH    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303209126100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D020004  4 000000C
050530525130126549700000000010045800MSSN    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303730022100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D080007  4 000000C
0505305251301285552000000000100458007T3M    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303449599100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D021488  4 000000C
0505305251301295603000000000100458004WXJ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303526289100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D097604  4 000000C
050530525130131565400000000010045800GSJ6    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303922041100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D036293  4 000000C
0505305251301335709000000000100458007BDB    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303850267100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D017607  4 000000C
050530525130134575500000000010045800PMB3    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303977730100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D012996  4 000000C
050530525130136579700000000010045800GS45    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303738447100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D042991  4 000000C
050530525130137584200000000010045800QJFJ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303575419100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D020004  4 000000C
050530525130139589000000000010045800DWWJ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303750996100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D032991  4 000000C
0505305251301415965000000000100458005G82    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303207146100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D097604  4 000000C
0505305251301436016000000000100458005VGV    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303162648100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D077688  4 000000C
050530525130144604900000000010045800VHK8    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303873103100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D032991  4 000000C
050530525130146609800000000010045800VLPX    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303646467100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D080007  4 000000C
050530525130147614200000000010045800JDSQ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303708689100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D027620  4 000000C
050530525130149619400000000010045800GF4M    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303479570100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D060007  4 000000C
050530525130150624300000000010045800KNBP    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303696421100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D072996  4 000000C
050530525130152628000000000010045800QRT9    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303323190100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D077620  4 000000C
050530525130153632500000000010045800MBCX    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303157481100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D066872  4 000000C
0505305251301546372000000000100458002643    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303705842100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D062996  4 000000C
050530525130156643400000000010045800QMVD    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303787733100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D036296  4 000000C
0505305251301576499000000000100458007J23    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303764765100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D077688  4 000000C
050530525130159657000000000010045800MLNZ    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
05004229989999000012000Z  24012285251165303332191100933050908000000000000   000000000100458MY MERCHANT              SHENZHEN     CN 531112345     1000D076296  4 000000C
050530525130160663600000000010045800H4TG    0000 000000000100N                             000000000000000 0000000000000000000000000100S1            0000000000000000   
910040122800000000000000000000000000000030600009000000000061000000        000000031000000000000000000000000000003000000000000000000000000000000000000000000000000       
920040122800000000000000000000000000000030000009000000000062000000        000000032000000000000000000000000000003000000000000000000000000000000000000000000000000       
【声明】内容源于网络
0
0
外卡收单知识库
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
内容 11
粉丝 0
关注 
在线咨询
外卡收单知识库  
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
总阅读1.0k
 粉丝0
 内容11
旗下产品 M123.com
关于
 关于我们
商务合作
友情链接
加入大数
企业会员
帮助中心
隐私协议
版权声明
