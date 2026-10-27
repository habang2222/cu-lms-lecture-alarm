using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

namespace SgangLectureAlarmHost
{
    internal sealed class AlertRequest
    {
        public string title { get; set; }
        public string message { get; set; }
    }

    internal static class Program
    {
        private const uint MbOk = 0x00000000;
        private const uint MbIconInformation = 0x00000040;
        private const uint MbSystemModal = 0x00001000;
        private const uint MbSetForeground = 0x00010000;
        private const uint MbTopmost = 0x00040000;

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int MessageBoxW(IntPtr windowHandle, string text, string caption, uint type);

        private static readonly string LogPath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "native-host.log"
        );

        [STAThread]
        private static int Main()
        {
            try
            {
                Log("START");
                AlertRequest request = ReadRequest();
                if (request == null)
                {
                    Log("NO_REQUEST");
                    return 1;
                }

                string title = Limit(request.title, 80, "싸강 완료 알림");
                string message = Limit(request.message, 500, "강의 재생이 완료되었습니다.");
                Log("SHOW " + title.Replace("\r", " ").Replace("\n", " "));
                ShowTopmostMessageBox(title, message);
                WriteResponse(true, "");
                Log("OK");
                return 0;
            }
            catch (Exception error)
            {
                Log("ERROR " + error.GetType().Name + " " + error.Message);
                try
                {
                    WriteResponse(false, error.Message);
                }
                catch
                {
                    // Chrome이 연결을 닫은 경우에는 그대로 종료합니다.
                }
                return 1;
            }
        }

        private static void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    LogPath,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                    Encoding.UTF8
                );
            }
            catch
            {
                // 로그 실패가 경고창 표시를 막지 않게 합니다.
            }
        }

        private static AlertRequest ReadRequest()
        {
            Stream input = Console.OpenStandardInput();
            byte[] lengthBytes = ReadExactly(input, 4);
            if (lengthBytes == null)
            {
                return null;
            }

            int length = BitConverter.ToInt32(lengthBytes, 0);
            if (length <= 0 || length > 1048576)
            {
                throw new InvalidDataException("올바르지 않은 메시지 크기입니다.");
            }

            byte[] body = ReadExactly(input, length);
            if (body == null)
            {
                throw new EndOfStreamException("메시지를 끝까지 읽지 못했습니다.");
            }

            string json = Encoding.UTF8.GetString(body);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            return serializer.Deserialize<AlertRequest>(json);
        }

        private static byte[] ReadExactly(Stream stream, int length)
        {
            byte[] buffer = new byte[length];
            int offset = 0;
            while (offset < length)
            {
                int read = stream.Read(buffer, offset, length - offset);
                if (read <= 0)
                {
                    return offset == 0 ? null : buffer;
                }
                offset += read;
            }
            return buffer;
        }

        private static string Limit(string value, int maxLength, string fallback)
        {
            string result = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
            return result.Length > maxLength ? result.Substring(0, maxLength) : result;
        }

        private static void ShowTopmostMessageBox(string title, string message)
        {
            MessageBoxW(
                IntPtr.Zero,
                message,
                title,
                MbOk | MbIconInformation | MbSystemModal | MbSetForeground | MbTopmost
            );
        }

        private static void WriteResponse(bool ok, string error)
        {
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            string json = serializer.Serialize(new { ok = ok, error = error ?? "" });
            byte[] body = Encoding.UTF8.GetBytes(json);
            byte[] lengthBytes = BitConverter.GetBytes(body.Length);
            Stream output = Console.OpenStandardOutput();
            output.Write(lengthBytes, 0, lengthBytes.Length);
            output.Write(body, 0, body.Length);
            output.Flush();
        }
    }
}
